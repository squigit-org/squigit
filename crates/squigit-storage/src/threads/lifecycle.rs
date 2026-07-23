// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use regex::Regex;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use crate::cas::AttachmentFileType;
use crate::error::{Result, StorageError};

use super::ocr::{ensure_empty_state_asset, retain_supported_ocr_annotations_ids};
use super::paths::{
    attachment_manifest_path, context_window_path, messages_path, ocr_annotations_path,
};
use super::{
    default_ocr_annotations, AttachmentManifest, AttachmentManifestEntry, ContextWindow,
    OcrAnnotations, ReverseImageSearchCache, ThreadData, ThreadMessage, ThreadMetadata,
    ThreadStorage, WorkspaceMetadata,
};

fn copy_dir_all(source: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let destination_path = destination.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &destination_path)?;
        } else {
            fs::copy(entry.path(), destination_path)?;
        }
    }

    Ok(())
}

fn normalize_hash(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() == 64 && trimmed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Some(trimmed.to_ascii_lowercase());
    }

    Path::new(trimmed)
        .file_stem()
        .and_then(|value| value.to_str())
        .and_then(normalize_hash)
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

fn retained_attachment_hashes(messages: &[ThreadMessage]) -> BTreeSet<String> {
    messages
        .iter()
        .flat_map(ThreadMessage::attachments)
        .map(|attachment| attachment.attachment_hash.clone())
        .collect()
}

fn validate_message_ids(messages: &[ThreadMessage]) -> Result<()> {
    let mut seen = BTreeSet::new();
    for message in messages {
        let id = message.id();
        let uuid = id.strip_prefix("msg_").ok_or_else(|| {
            StorageError::InvalidThreadMessage(format!("message ID `{id}` has no msg_ prefix"))
        })?;
        uuid::Uuid::parse_str(uuid).map_err(|_| {
            StorageError::InvalidThreadMessage(format!("message ID `{id}` is not a UUID"))
        })?;
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

fn retain_referenced_attachments(thread: &mut ThreadData) {
    let retained = retained_attachment_hashes(&thread.messages);
    let initial_hash = thread.metadata.image_hash.clone();
    thread.attachment_manifest.retain(|entry| {
        entry.attachment_hash == initial_hash || retained.contains(&entry.attachment_hash)
    });
    sort_attachment_manifest(&mut thread.attachment_manifest, &initial_hash);
}

fn source_for_hash(thread: &ThreadData, hash: &str) -> Option<(DateTime<Utc>, String)> {
    thread
        .messages
        .iter()
        .filter_map(|message| match message {
            ThreadMessage::User {
                timestamp,
                attachments,
                ..
            } => attachments
                .iter()
                .find(|attachment| attachment.attachment_hash == hash)
                .and_then(|attachment| attachment.source_path.as_deref())
                .map(str::trim)
                .filter(|source_path| !source_path.is_empty() && Path::new(source_path).is_file())
                .map(|source_path| (*timestamp, source_path.to_string())),
            ThreadMessage::Assistant { .. } => None,
        })
        .max_by(|left, right| left.0.cmp(&right.0))
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
        let mut object_manifest = self.load_object_manifest(&hash)?;

        if object_manifest.file_context.file_type == AttachmentFileType::TextLocal
            && object_manifest.file_context.file_brief.is_none()
        {
            let bytes = fs::read(self.find_object_blob(&hash)?)?;
            object_manifest.file_context.file_brief =
                Some(std::str::from_utf8(&bytes)?.to_string());
            self.save_object_manifest(&hash, &object_manifest)?;
        }

        Ok(AttachmentManifestEntry {
            attachment_hash: hash,
            display_name: display_name.trim().to_string(),
            file_type: object_manifest.file_context.file_type,
            file_brief: object_manifest.file_context.file_brief,
            last_mention_at,
        })
    }

    fn apply_user_message_attachments(
        &self,
        thread: &mut ThreadData,
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
            let display_name = names.get(&hash).cloned().unwrap_or(fallback_name);
            let fresh = self.attachment_manifest_entry(&hash, &display_name, *timestamp)?;

            if let Some(existing) = thread
                .attachment_manifest
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
                thread.attachment_manifest.push(fresh);
            }
        }

        sort_attachment_manifest(&mut thread.attachment_manifest, &thread.metadata.image_hash);
        Ok(())
    }

    pub fn refresh_attachment_manifest(&self, thread_id: &str) -> Result<AttachmentManifest> {
        let mut thread = self.load_thread(thread_id)?;
        let mut changed = false;

        for entry in &mut thread.attachment_manifest {
            let object_manifest = self.load_object_manifest(&entry.attachment_hash)?;
            if entry.file_type != object_manifest.file_context.file_type {
                entry.file_type = object_manifest.file_context.file_type.clone();
                changed = true;
            }
            if entry.file_brief != object_manifest.file_context.file_brief {
                entry.file_brief = object_manifest.file_context.file_brief.clone();
                changed = true;
            }
        }
        sort_attachment_manifest(&mut thread.attachment_manifest, &thread.metadata.image_hash);
        if changed {
            self.save_thread_files(&thread)?;
        }
        Ok(thread.attachment_manifest)
    }

    pub fn touch_attachment(&self, thread_id: &str, attachment_hash: &str) -> Result<()> {
        let hash = normalize_hash(attachment_hash).ok_or(StorageError::InvalidHash)?;
        let mut thread = self.load_thread(thread_id)?;
        let entry = thread
            .attachment_manifest
            .iter_mut()
            .find(|entry| entry.attachment_hash == hash)
            .ok_or_else(|| StorageError::ImageNotFound(hash.clone()))?;
        entry.last_mention_at = Utc::now();
        sort_attachment_manifest(&mut thread.attachment_manifest, &thread.metadata.image_hash);
        self.save_thread_files(&thread)
    }

    pub fn get_message(&self, thread_id: &str, message_id: &str) -> Result<Option<ThreadMessage>> {
        Ok(self
            .load_thread(thread_id)?
            .messages
            .into_iter()
            .find(|message| message.id() == message_id))
    }

    /// Find the newest existing source path recorded for an object hash.
    pub fn get_attachment_source_path(
        &self,
        attachment_hash_or_path: &str,
        thread_id: Option<&str>,
    ) -> Result<Option<String>> {
        let Some(hash) = normalize_hash(attachment_hash_or_path) else {
            return Ok(None);
        };

        if let Some(thread_id) = thread_id {
            return self
                .load_thread(thread_id)
                .map(|thread| source_for_hash(&thread, &hash).map(|(_, path)| path));
        }

        let mut newest = None::<(DateTime<Utc>, String)>;
        for metadata in self.list_threads()? {
            if let Ok(thread) = self.load_thread(&metadata.id) {
                if let Some(candidate) = source_for_hash(&thread, &hash) {
                    if newest
                        .as_ref()
                        .is_none_or(|current| candidate.0 > current.0)
                    {
                        newest = Some(candidate);
                    }
                }
            }
        }
        Ok(newest.map(|(_, path)| path))
    }

    fn save_thread_files(&self, thread: &ThreadData) -> Result<()> {
        let thread_dir = self.thread_dir(&thread.metadata.id);
        fs::create_dir_all(&thread_dir)?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut ocr_data = thread.ocr_data.clone();
        ensure_empty_state_asset(&mut ocr_data);
        retain_supported_ocr_annotations_ids(&mut ocr_data);
        super::atomic_write(
            &ocr_path,
            serde_json::to_string_pretty(&ocr_data)?.as_bytes(),
        )?;

        let context_path = context_window_path(&thread_dir);
        if !context_path.exists() {
            super::atomic_write(
                &context_path,
                serde_json::to_string_pretty(&thread.context_window)?.as_bytes(),
            )?;
        }

        let reverse_path = super::paths::reverse_image_search_path(&thread_dir);
        if !reverse_path.exists() {
            super::atomic_write(
                &reverse_path,
                serde_json::to_string_pretty(&thread.reverse_image_search)?.as_bytes(),
            )?;
        }

        super::atomic_write(
            &messages_path(&thread_dir),
            serde_json::to_string_pretty(&thread.messages)?.as_bytes(),
        )?;
        super::atomic_write(
            &attachment_manifest_path(&thread_dir),
            serde_json::to_string_pretty(&thread.attachment_manifest)?.as_bytes(),
        )?;
        Ok(())
    }

    pub fn save_thread(&self, thread: &ThreadData) -> Result<()> {
        self.save_thread_files(thread)?;
        self.update_index(&thread.metadata)
    }

    pub fn save_thread_in_workspace(&self, thread: &ThreadData, workspace_id: &str) -> Result<()> {
        self.save_thread_files(thread)?;
        self.update_index_in_workspace(&thread.metadata, workspace_id)
    }

    pub fn set_thread_workspace(&self, thread_id: &str, workspace_id: &str) -> Result<()> {
        let metadata = self.get_index_metadata(thread_id)?;
        self.update_index_in_workspace(&metadata, workspace_id)
    }

    pub fn load_thread(&self, thread_id: &str) -> Result<ThreadData> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let metadata = self.get_index_metadata(thread_id)?;
        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations_changed = false;
        let mut ocr_data: OcrAnnotations = if ocr_path.exists() {
            serde_json::from_str(&fs::read_to_string(&ocr_path)?)?
        } else {
            default_ocr_annotations()
        };
        annotations_changed |= ensure_empty_state_asset(&mut ocr_data);
        annotations_changed |= retain_supported_ocr_annotations_ids(&mut ocr_data);
        if annotations_changed {
            super::atomic_write(
                &ocr_path,
                serde_json::to_string_pretty(&ocr_data)?.as_bytes(),
            )?;
        }

        let messages = if messages_path(&thread_dir).exists() {
            serde_json::from_str::<Vec<ThreadMessage>>(&fs::read_to_string(messages_path(
                &thread_dir,
            ))?)?
        } else {
            Vec::new()
        };
        let context_window = if context_window_path(&thread_dir).exists() {
            serde_json::from_str::<ContextWindow>(&fs::read_to_string(context_window_path(
                &thread_dir,
            ))?)?
        } else {
            ContextWindow::default()
        };
        let reverse_path = super::paths::reverse_image_search_path(&thread_dir);
        let reverse_image_search = if reverse_path.exists() {
            serde_json::from_str::<ReverseImageSearchCache>(&fs::read_to_string(reverse_path)?)?
        } else {
            ReverseImageSearchCache::default()
        };
        let attachment_manifest = serde_json::from_str::<AttachmentManifest>(&fs::read_to_string(
            attachment_manifest_path(&thread_dir),
        )?)?;
        let image_tone = self.get_image_tone(&metadata.image_hash);

        Ok(ThreadData {
            metadata,
            messages,
            ocr_data,
            context_window,
            reverse_image_search,
            attachment_manifest,
            image_tone,
        })
    }

    pub fn save_image_tone(&self, thread_id: &str, tone: &str) -> Result<()> {
        let metadata = self.get_index_metadata(thread_id)?;
        let mut manifest = self.load_object_manifest(&metadata.image_hash)?;
        manifest.file_context.image_tone = Some(tone.to_string());
        self.save_object_manifest(&metadata.image_hash, &manifest)
    }

    pub fn list_threads(&self) -> Result<Vec<ThreadMetadata>> {
        let mut threads = self
            .read_index()?
            .workspaces
            .into_iter()
            .flat_map(|workspace| workspace.threads.into_values())
            .collect::<Vec<_>>();
        threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(threads)
    }

    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceMetadata>> {
        Ok(self.read_index()?.workspaces)
    }

    pub fn delete_thread(&self, thread_id: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if thread_dir.exists() {
            fs::remove_dir_all(&thread_dir)?;
        }
        self.remove_from_index(thread_id)?;
        Ok(())
    }

    pub fn fork_thread(&self, thread_id: &str, message_index: usize) -> Result<ThreadMetadata> {
        let source_dir = self.thread_dir(thread_id);
        if !source_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let source_workspace_id = self.get_thread_workspace_id(thread_id)?;
        let source_thread = self.load_thread(thread_id)?;
        let retained_len = message_index.checked_add(1).ok_or_else(|| {
            StorageError::InvalidThreadFork(format!("message index {message_index} is too large"))
        })?;
        if retained_len > source_thread.messages.len() {
            return Err(StorageError::InvalidThreadFork(format!(
                "message index {message_index} is outside thread {thread_id}"
            )));
        }

        let mut metadata = ThreadMetadata::new(
            format!("forked {}", source_thread.metadata.title),
            source_thread.metadata.image_hash.clone(),
        );
        metadata.pinned_at = None;
        let destination_dir = self.thread_dir(&metadata.id);
        copy_dir_all(&source_dir, &destination_dir)?;

        let mut forked_thread = source_thread;
        forked_thread.metadata = metadata.clone();
        forked_thread.messages.truncate(retained_len);
        let initial_hash = forked_thread.metadata.image_hash.clone();
        let initial = forked_thread
            .attachment_manifest
            .iter()
            .find(|entry| entry.attachment_hash == initial_hash)
            .cloned()
            .ok_or(StorageError::ImageNotFound(initial_hash))?;
        forked_thread.attachment_manifest = vec![initial];
        let retained_messages = forked_thread.messages.clone();
        for message in &retained_messages {
            self.apply_user_message_attachments(&mut forked_thread, message)?;
        }
        self.save_thread_in_workspace(&forked_thread, &source_workspace_id)?;
        Ok(metadata)
    }

    pub fn update_thread_metadata(&self, metadata: &ThreadMetadata) -> Result<()> {
        if !self.thread_dir(&metadata.id).exists() {
            return Err(StorageError::ThreadNotFound(metadata.id.clone()));
        }
        self.update_index(metadata)?;
        Ok(())
    }

    pub fn append_message(&self, thread_id: &str, message: &ThreadMessage) -> Result<()> {
        let mut thread = self.load_thread(thread_id)?;
        validate_message_ids(std::slice::from_ref(message))?;
        if thread
            .messages
            .iter()
            .any(|existing| existing.id() == message.id())
        {
            return Err(StorageError::InvalidThreadMessage(format!(
                "duplicate message ID `{}`",
                message.id()
            )));
        }
        self.apply_user_message_attachments(&mut thread, message)?;
        thread.messages.push(message.clone());
        thread.metadata.updated_at = Utc::now();
        self.save_thread(&thread)
    }

    pub fn overwrite_messages(&self, thread_id: &str, messages: Vec<ThreadMessage>) -> Result<()> {
        let mut thread = self.load_thread(thread_id)?;
        validate_message_ids(&messages)?;
        let next_ids = messages
            .iter()
            .map(|message| message.id().to_string())
            .collect::<BTreeSet<_>>();
        let removed_message = thread
            .messages
            .iter()
            .any(|message| !next_ids.contains(message.id()));
        if removed_message {
            let initial_hash = thread.metadata.image_hash.clone();
            let initial = thread
                .attachment_manifest
                .iter()
                .find(|entry| entry.attachment_hash == initial_hash)
                .cloned()
                .ok_or_else(|| StorageError::ImageNotFound(initial_hash.clone()))?;
            thread.attachment_manifest = vec![initial];
        }
        thread.messages = messages;
        let saved_messages = thread.messages.clone();
        for message in &saved_messages {
            self.apply_user_message_attachments(&mut thread, message)?;
        }
        retain_referenced_attachments(&mut thread);
        thread.metadata.updated_at = Utc::now();
        self.save_thread(&thread)
    }
}
