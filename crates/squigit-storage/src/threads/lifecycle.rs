// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use super::{index, ocr, records};
use super::{
    AttachmentManifest, AttachmentManifestEntry, ContextWindow, Conversation, ForkSourceKind,
    ForkedFrom, ManifestMention, SideChatData, SideChatMetadata, ThreadData, ThreadMessage,
    ThreadMetadata, ThreadStorage,
};
use crate::{HistoryInterface, HistoryStore, Result, StorageError};

fn normalize_hash(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() == 64 && trimmed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Some(trimmed.to_ascii_lowercase());
    }

    let stem = Path::new(trimmed)
        .file_stem()
        .and_then(|value| value.to_str())?;
    if stem == trimmed {
        return None;
    }
    normalize_hash(stem)
}

fn attachment_display_names(content: &str) -> BTreeMap<String, String> {
    let re = Regex::new(r"\[([^\]\n]+)\]\((<[^>\n]+>|[^)\n]+)\)")
        .expect("attachment markdown regex must compile");
    let mut names = BTreeMap::new();

    for capture in re.captures_iter(content) {
        let Some(label) = capture.get(1).map(|value| value.as_str().trim()) else {
            continue;
        };
        let Some(raw_path) = capture.get(2).map(|value| value.as_str().trim()) else {
            continue;
        };
        let unwrapped = raw_path
            .strip_prefix('<')
            .and_then(|value| value.strip_suffix('>'))
            .unwrap_or(raw_path);
        let Some(path) = unwrapped.strip_prefix("file://") else {
            continue;
        };
        if let Some(hash) = normalize_hash(path) {
            names.entry(hash).or_insert_with(|| label.to_string());
        }
    }

    names
}

fn sort_attachment_manifest(manifest: &mut AttachmentManifest, initial_hash: &str) {
    manifest.sort_by(|left, right| {
        let left_initial = left.attachment_hash == initial_hash;
        let right_initial = right.attachment_hash == initial_hash;
        match (left_initial, right_initial) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => right
                .last_mention_at
                .cmp(&left.last_mention_at)
                .then_with(|| left.attachment_hash.cmp(&right.attachment_hash)),
        }
    });
}

fn manifest_through_messages(
    source: &AttachmentManifest,
    messages: &[ThreadMessage],
    initial_hash: &str,
    created_at: DateTime<Utc>,
) -> AttachmentManifest {
    let mut mentions = BTreeMap::<String, (DateTime<Utc>, Option<String>)>::new();
    for message in messages {
        let ThreadMessage::User {
            content,
            timestamp,
            attachments,
            ..
        } = message
        else {
            continue;
        };
        let names = attachment_display_names(content);
        for attachment in attachments {
            let mention = mentions
                .entry(attachment.attachment_hash.clone())
                .or_insert((*timestamp, None));
            if mention.0 <= *timestamp {
                mention.0 = *timestamp;
                if let Some(name) = names.get(&attachment.attachment_hash) {
                    mention.1 = Some(name.clone());
                }
            }
        }
    }

    let mut retained = source
        .iter()
        .filter_map(|entry| {
            let mention = mentions.get(&entry.attachment_hash);
            if entry.attachment_hash != initial_hash && mention.is_none() {
                return None;
            }
            let mut entry = entry.clone();
            entry.last_mention_at = mention
                .map(|(timestamp, _)| *timestamp)
                .unwrap_or(created_at);
            if let Some((_, Some(name))) = mention {
                entry.display_name = name.clone();
            }
            Some(entry)
        })
        .collect::<AttachmentManifest>();
    sort_attachment_manifest(&mut retained, initial_hash);
    retained
}

fn validate_message_ids(messages: &[ThreadMessage]) -> Result<()> {
    let mut seen = BTreeSet::new();
    for message in messages {
        let id = message.id();
        if !ThreadMessage::is_valid_id(id) {
            return Err(StorageError::InvalidThreadMessage(format!(
                "message ID `{id}` must use the msg-<UUID> format"
            )));
        }
        if !seen.insert(id) {
            return Err(StorageError::InvalidThreadMessage(format!(
                "duplicate message ID `{id}`"
            )));
        }
        let mut attachment_hashes = BTreeSet::new();
        for attachment in message.attachments() {
            let hash = attachment.attachment_hash.as_str();
            if hash.len() != 64
                || !hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            {
                return Err(StorageError::InvalidThreadMessage(format!(
                    "attachment hash `{hash}` is not a canonical BLAKE3 hash"
                )));
            }
            if !attachment_hashes.insert(hash) {
                return Err(StorageError::InvalidThreadMessage(format!(
                    "message `{id}` repeats attachment hash `{hash}`"
                )));
            }
        }
    }
    Ok(())
}

impl ThreadStorage {
    pub fn attachment_manifest_entry(
        &self,
        attachment_hash: &str,
        display_name: &str,
        last_mention_at: DateTime<Utc>,
    ) -> Result<AttachmentManifestEntry> {
        let hash = normalize_hash(attachment_hash).ok_or(StorageError::InvalidHash)?;
        self.find_object_blob(&hash)?;
        let object_manifest = self.load_object_manifest(&hash)?;

        Ok(AttachmentManifestEntry {
            attachment_hash: hash,
            display_name: display_name.trim().to_string(),
            file_type: object_manifest.file_context.file_type,
            file_brief: object_manifest.file_context.file_brief,
            last_mention_at,
        })
    }

    fn apply_user_message_attachments_to_manifest(
        &self,
        manifest: &mut AttachmentManifest,
        initial_hash: &str,
        message: &ThreadMessage,
    ) -> Result<()> {
        let ThreadMessage::User {
            content,
            timestamp,
            attachments,
            ..
        } = message
        else {
            return Ok(());
        };
        let names = attachment_display_names(content);

        for attachment in attachments {
            let hash =
                normalize_hash(&attachment.attachment_hash).ok_or(StorageError::InvalidHash)?;
            let fallback_name = self
                .find_object_blob(&hash)?
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("attachment")
                .to_string();
            let display_name = names
                .get(&hash)
                .cloned()
                .or_else(|| {
                    manifest
                        .iter()
                        .find(|entry| entry.attachment_hash == hash)
                        .map(|entry| entry.display_name.clone())
                })
                .unwrap_or(fallback_name);
            let fresh = self.attachment_manifest_entry(&hash, &display_name, *timestamp)?;

            if let Some(existing) = manifest
                .iter_mut()
                .find(|entry| entry.attachment_hash == hash)
            {
                existing.display_name = fresh.display_name;
                existing.file_type = fresh.file_type;
                existing.file_brief = fresh.file_brief;
                if existing.last_mention_at < *timestamp {
                    existing.last_mention_at = *timestamp;
                }
            } else {
                manifest.push(fresh);
            }
        }

        sort_attachment_manifest(manifest, initial_hash);
        Ok(())
    }

    fn populate_attachment_briefs(&self, manifest: &mut AttachmentManifest) {
        for entry in manifest {
            if let Ok(object) = self.load_object_manifest(&entry.attachment_hash) {
                if object.file_context.file_brief.is_some() {
                    entry.file_brief = object.file_context.file_brief;
                }
            }
        }
    }

    fn touch_manifest_mention(
        &self,
        manifest: &mut AttachmentManifest,
        initial_hash: &str,
        mention: &ManifestMention,
        timestamp: DateTime<Utc>,
    ) -> Result<()> {
        let Some(hash) = normalize_hash(&mention.attachment_hash) else {
            return Ok(());
        };
        let blob_path = match self.find_object_blob(&hash) {
            Ok(path) => path,
            Err(_) => return Ok(()),
        };
        let display_name = mention
            .display_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| {
                blob_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("attachment")
                    .to_string()
            });
        if let Some(existing) = manifest
            .iter_mut()
            .find(|entry| entry.attachment_hash == hash)
        {
            existing.display_name = display_name;
            if let Some(file_type) = &mention.file_type {
                existing.file_type = file_type.clone();
            }
            if existing.last_mention_at < timestamp {
                existing.last_mention_at = timestamp;
            }
        } else {
            manifest.push(AttachmentManifestEntry {
                attachment_hash: hash.clone(),
                display_name,
                file_type: mention
                    .file_type
                    .clone()
                    .unwrap_or(self.load_object_manifest(&hash)?.file_context.file_type),
                file_brief: None,
                last_mention_at: timestamp,
            });
        }
        sort_attachment_manifest(manifest, initial_hash);
        Ok(())
    }

    fn load_thread_on(&self, connection: &Connection, id: &str) -> Result<ThreadData> {
        let metadata = records::get_thread(connection, id)?;
        let image_tone = self.get_image_tone(&metadata.image_hash);
        let reverse_image_search = self.get_reverse_image_search_cache(&metadata.image_hash)?;
        Ok(ThreadData {
            metadata,
            messages: records::messages(connection, id)?,
            ocr_data: ocr::annotations(connection, id)?,
            context_window: records::context(connection, id)?,
            attachment_manifest: records::attachments(connection, id)?,
            image_tone,
            reverse_image_search,
        })
    }

    fn load_sidechat_on(&self, connection: &Connection, id: &str) -> Result<SideChatData> {
        Ok(SideChatData {
            metadata: records::get_sidechat(connection, id)?,
            messages: records::messages(connection, id)?,
            context_window: records::context(connection, id)?,
            attachment_manifest: records::attachments(connection, id)?,
        })
    }

    fn load_conversation_on(&self, connection: &Connection, id: &str) -> Result<Conversation> {
        match records::conversation_kind(connection, id)?.as_str() {
            "thread" => self
                .load_thread_on(connection, id)
                .map(Conversation::Thread),
            "sidechat" => self
                .load_sidechat_on(connection, id)
                .map(Conversation::Sidechat),
            _ => Err(StorageError::ThreadNotFound(id.into())),
        }
    }

    fn put_manifest(
        &self,
        connection: &Connection,
        id: &str,
        manifest: &AttachmentManifest,
    ) -> Result<()> {
        let mut manifest = manifest.clone();
        self.populate_attachment_briefs(&mut manifest);
        records::put_attachments(connection, id, &manifest)
    }

    fn save_thread_on(&self, connection: &Connection, thread: &ThreadData) -> Result<()> {
        records::put_thread(connection, &thread.metadata)?;
        let id = &thread.metadata.id;
        ocr::put_annotations(connection, id, &thread.ocr_data)?;
        records::put_context(connection, id, &thread.context_window, true)?;
        records::put_messages(connection, id, &thread.messages)?;
        self.put_manifest(connection, id, &thread.attachment_manifest)
    }

    fn save_sidechat_on(&self, connection: &Connection, sidechat: &SideChatData) -> Result<()> {
        validate_message_ids(&sidechat.messages)?;
        records::put_sidechat(connection, &sidechat.metadata)?;
        let id = &sidechat.metadata.id;
        records::put_context(connection, id, &sidechat.context_window, false)?;
        records::put_messages(connection, id, &sidechat.messages)?;
        self.put_manifest(connection, id, &sidechat.attachment_manifest)
    }

    pub fn save_thread(&self, thread: &ThreadData) -> Result<()> {
        self.database
            .write(|connection| self.save_thread_on(connection, thread))
    }

    pub fn save_thread_in_workspace(&self, thread: &ThreadData, workspace_id: &str) -> Result<()> {
        self.database.write(|connection| {
            self.save_thread_on(connection, thread)?;
            index::set_workspace(connection, &thread.metadata.id, Some(workspace_id))
        })
    }

    pub fn save_sidechat(&self, sidechat: &SideChatData) -> Result<()> {
        self.save_sidechat_with_interface(sidechat, None)
    }

    pub fn save_sidechat_with_history(
        &self,
        sidechat: &SideChatData,
        interface: HistoryInterface,
    ) -> Result<()> {
        self.save_sidechat_with_interface(sidechat, Some(interface))
    }

    fn save_sidechat_with_interface(
        &self,
        sidechat: &SideChatData,
        interface: Option<HistoryInterface>,
    ) -> Result<()> {
        validate_message_ids(&sidechat.messages)?;
        let mut persisted = sidechat.clone();
        for message in &sidechat.messages {
            self.apply_user_message_attachments_to_manifest(
                &mut persisted.attachment_manifest,
                "",
                message,
            )?;
        }
        self.database.write(|connection| {
            self.save_sidechat_on(connection, &persisted)?;
            if let Some(interface) = interface {
                let message = sidechat.messages.last().ok_or_else(|| {
                    StorageError::InvalidHistory("Composer message is missing".into())
                })?;
                HistoryStore::with_base_dir(self.base_dir.clone())?
                    .append_message(interface, message)?;
            }
            Ok(())
        })
    }

    pub fn save_conversation(&self, conversation: &Conversation) -> Result<()> {
        self.database.write(|connection| match conversation {
            Conversation::Thread(thread) => self.save_thread_on(connection, thread),
            Conversation::Sidechat(sidechat) => self.save_sidechat_on(connection, sidechat),
        })
    }

    pub fn load_thread(&self, id: &str) -> Result<ThreadData> {
        self.database
            .read(|connection| self.load_thread_on(connection, id))
    }

    pub fn load_sidechat(&self, id: &str) -> Result<SideChatData> {
        self.database
            .read(|connection| self.load_sidechat_on(connection, id))
    }

    pub fn load_conversation(&self, id: &str) -> Result<Conversation> {
        self.database
            .read(|connection| self.load_conversation_on(connection, id))
    }

    pub fn load_conversation_metadata(&self, id: &str) -> Result<(String, String)> {
        self.database.read(|connection| {
            connection
                .query_row(
                    "SELECT title, kind FROM conversations WHERE id = ?1",
                    [id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| StorageError::ThreadNotFound(id.into()))
        })
    }

    pub fn load_messages(&self, id: &str) -> Result<Vec<ThreadMessage>> {
        self.database.read(|connection| {
            records::conversation_kind(connection, id)?;
            records::messages(connection, id)
        })
    }

    pub fn push_message(
        &self,
        id: &str,
        message: ThreadMessage,
        mentions: &[ManifestMention],
        interface: Option<HistoryInterface>,
    ) -> Result<()> {
        self.database.write(|connection| {
            let mut conversation = self.load_conversation_on(connection, id)?;
            let timestamp = match &message {
                ThreadMessage::User { timestamp, .. }
                | ThreadMessage::Assistant { timestamp, .. } => *timestamp,
            };
            let position = conversation.messages().len();
            conversation.messages_mut().push(message.clone());
            validate_message_ids(conversation.messages())?;
            let initial_hash = conversation.initial_hash().to_string();
            for mention in mentions {
                self.touch_manifest_mention(
                    conversation.manifest_mut(),
                    &initial_hash,
                    mention,
                    timestamp,
                )?;
            }
            records::insert_message(connection, id, position, &message)?;
            self.put_manifest(connection, id, conversation.manifest())?;
            connection.execute(
                "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
                params![Utc::now(), id],
            )?;
            if let Some(interface) = interface {
                HistoryStore::with_base_dir(self.base_dir.clone())?
                    .append_message(interface, &message)?;
            }
            Ok(())
        })
    }

    pub fn load_history_message(
        &self,
        message_id: &str,
    ) -> Result<Option<(ThreadMessage, AttachmentManifest)>> {
        self.database.read(|connection| {
            let Some((conversation_id, message)) = records::message_by_id(connection, message_id)?
            else {
                return Ok(None);
            };
            let mut manifest = records::attachments(connection, &conversation_id)?;
            manifest.retain(|entry| {
                message
                    .attachments()
                    .iter()
                    .any(|attachment| attachment.attachment_hash == entry.attachment_hash)
            });
            Ok(Some((message, manifest)))
        })
    }

    pub fn truncate_messages(&self, id: &str, from_message_id: &str) -> Result<usize> {
        self.database.write(|connection| {
            records::conversation_kind(connection, id)?;
            let messages = records::messages(connection, id)?;
            let position = messages
                .iter()
                .position(|message| message.id() == from_message_id)
                .ok_or_else(|| {
                    StorageError::InvalidThreadMessage(format!(
                        "message {from_message_id} was not found"
                    ))
                })?;
            connection.execute(
                "DELETE FROM messages WHERE conversation_id = ?1 AND position >= ?2",
                params![id, position as i64],
            )?;
            Ok(messages.len() - position)
        })
    }

    pub fn register_read_attachment(
        &self,
        id: &str,
        hash: &str,
        name: &str,
    ) -> Result<AttachmentManifestEntry> {
        let entry = self.attachment_manifest_entry(hash, name, Utc::now())?;
        self.database.write(|connection| {
            records::conversation_kind(connection, id)?;
            let mut manifest = records::attachments(connection, id)?;
            if let Some(existing) = manifest
                .iter_mut()
                .find(|item| item.attachment_hash == entry.attachment_hash)
            {
                *existing = entry.clone();
            } else {
                manifest.push(entry.clone());
            }
            records::put_attachments(connection, id, &manifest)?;
            Ok(entry)
        })
    }

    pub fn refresh_attachment_briefs(&self, id: &str) -> Result<()> {
        self.database.write(|connection| {
            records::conversation_kind(connection, id)?;
            self.put_manifest(connection, id, &records::attachments(connection, id)?)
        })
    }

    pub fn update_thread_metadata(&self, metadata: &ThreadMetadata) -> Result<()> {
        self.database.write(|connection| {
            records::get_thread(connection, &metadata.id)?;
            records::put_thread(connection, metadata)
        })
    }

    pub fn update_sidechat_metadata(&self, metadata: &SideChatMetadata) -> Result<()> {
        self.database.write(|connection| {
            records::get_sidechat(connection, &metadata.id)?;
            records::put_sidechat(connection, metadata)
        })
    }

    pub fn set_thread_workspace(&self, id: &str, workspace_id: Option<&str>) -> Result<()> {
        self.database.write(|connection| {
            records::get_thread(connection, id)?;
            index::set_workspace(connection, id, workspace_id)
        })
    }

    pub fn delete_thread(&self, id: &str) -> Result<()> {
        self.delete_threads(&[id.into()])
    }

    pub fn delete_threads(&self, ids: &[String]) -> Result<()> {
        self.database.write(|connection| {
            for id in ids {
                connection.execute(
                    "DELETE FROM conversations WHERE id = ?1 AND kind = 'thread'",
                    [id],
                )?;
            }
            Ok(())
        })
    }

    pub fn delete_sidechat(&self, id: &str) -> Result<()> {
        self.database.write(|connection| {
            connection.execute(
                "DELETE FROM conversations WHERE id = ?1 AND kind = 'sidechat'",
                [id],
            )?;
            Ok(())
        })
    }

    fn fork_thread(&self, id: &str, message_id: Option<&str>) -> Result<ThreadMetadata> {
        self.database.write(|connection| {
            let mut thread = self.load_thread_on(connection, id)?;
            let source = thread.metadata.clone();
            let workspace_id = index::workspace_id(connection, id)?;
            let (title, version) = index::next_fork_version(
                connection,
                "thread",
                &source.fork_family_id,
                &source.title,
                source.fork_version,
            )?;
            let mut metadata = ThreadMetadata::new(
                format!("{title} ({version})"),
                source.image_hash.clone(),
                source.original_image_hash.clone(),
                source.image_blob.clone(),
            );
            metadata.fork_family_id = source.fork_family_id;
            metadata.fork_version = version;
            if let Some(message_id) = message_id {
                truncate_fork(
                    &mut thread.messages,
                    message_id,
                    ForkedFrom {
                        kind: ForkSourceKind::Thread,
                        conversation_id: id.into(),
                        title: source.title,
                    },
                )?;
                thread.attachment_manifest = manifest_through_messages(
                    &thread.attachment_manifest,
                    &thread.messages,
                    &source.image_hash,
                    source.created_at,
                );
                thread.context_window = ContextWindow::default();
                validate_message_ids(&thread.messages)?;
            }
            thread.metadata = metadata.clone();
            for message in &mut thread.messages {
                message.renew_id();
            }
            self.save_thread_on(connection, &thread)?;
            index::set_workspace(connection, &metadata.id, workspace_id.as_deref())?;
            Ok(metadata)
        })
    }

    pub fn fork_thread_latest(&self, id: &str) -> Result<ThreadMetadata> {
        self.fork_thread(id, None)
    }

    pub fn fork_thread_at_message(&self, id: &str, message_id: &str) -> Result<ThreadMetadata> {
        self.fork_thread(id, Some(message_id))
    }

    fn fork_sidechat(&self, id: &str, message_id: Option<&str>) -> Result<SideChatMetadata> {
        self.database.write(|connection| {
            let mut sidechat = self.load_sidechat_on(connection, id)?;
            let source = sidechat.metadata.clone();
            let (title, version) = index::next_fork_version(
                connection,
                "sidechat",
                &source.fork_family_id,
                &source.title,
                source.fork_version,
            )?;
            let mut metadata = SideChatMetadata::new(format!("{title} ({version})"));
            metadata.fork_family_id = source.fork_family_id;
            metadata.fork_version = version;
            if let Some(message_id) = message_id {
                truncate_fork(
                    &mut sidechat.messages,
                    message_id,
                    ForkedFrom {
                        kind: ForkSourceKind::Sidechat,
                        conversation_id: id.into(),
                        title: source.title,
                    },
                )?;
                sidechat.attachment_manifest = manifest_through_messages(
                    &sidechat.attachment_manifest,
                    &sidechat.messages,
                    "",
                    source.created_at,
                );
                sidechat.context_window = ContextWindow::default();
            }
            sidechat.metadata = metadata.clone();
            for message in &mut sidechat.messages {
                message.renew_id();
            }
            self.save_sidechat_on(connection, &sidechat)?;
            Ok(metadata)
        })
    }

    pub fn fork_sidechat_latest(&self, id: &str) -> Result<SideChatMetadata> {
        self.fork_sidechat(id, None)
    }

    pub fn fork_sidechat_at_message(&self, id: &str, message_id: &str) -> Result<SideChatMetadata> {
        self.fork_sidechat(id, Some(message_id))
    }
}

fn truncate_fork(
    messages: &mut Vec<ThreadMessage>,
    message_id: &str,
    source: ForkedFrom,
) -> Result<()> {
    let position = messages
        .iter()
        .position(|message| message.id() == message_id)
        .ok_or_else(|| {
            StorageError::InvalidThreadMessage(format!(
                "message `{message_id}` was not found in `{}`",
                source.conversation_id
            ))
        })?;
    if !matches!(&messages[position], ThreadMessage::Assistant { .. }) {
        return Err(StorageError::InvalidThreadMessage(format!(
            "message `{message_id}` is not an assistant message"
        )));
    }
    messages.truncate(position + 1);
    if let Some(ThreadMessage::Assistant { forked_from, .. }) = messages.last_mut() {
        *forked_from = Some(source);
    }
    Ok(())
}
