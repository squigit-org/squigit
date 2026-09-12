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
    OcrAnnotations, SideChatData, SideChatMetadata, ThreadData, ThreadMessage, ThreadMetadata,
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
            let display_name = names.get(&hash).cloned().unwrap_or(fallback_name);
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

    fn apply_user_message_attachments(
        &self,
        thread: &mut ThreadData,
        message: &ThreadMessage,
    ) -> Result<()> {
        self.apply_user_message_attachments_to_manifest(
            &mut thread.attachment_manifest,
            &thread.metadata.image_hash,
            message,
        )?;
        Ok(())
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
        self.update_index_in_workspace(&thread.metadata, Some(workspace_id))
    }

    fn save_sidechat_files(&self, sidechat: &SideChatData) -> Result<()> {
        let thread_dir = self.thread_dir(&sidechat.metadata.id);
        fs::create_dir_all(&thread_dir)?;
        super::atomic_write(
            &context_window_path(&thread_dir),
            serde_json::to_string_pretty(&sidechat.context_window)?.as_bytes(),
        )?;
        super::atomic_write(
            &messages_path(&thread_dir),
            serde_json::to_string_pretty(&sidechat.messages)?.as_bytes(),
        )?;
        super::atomic_write(
            &attachment_manifest_path(&thread_dir),
            serde_json::to_string_pretty(&sidechat.attachment_manifest)?.as_bytes(),
        )?;
        Ok(())
    }

    pub fn save_sidechat(&self, sidechat: &SideChatData) -> Result<()> {
        validate_message_ids(&sidechat.messages)?;
        let mut persisted = sidechat.clone();
        let messages = persisted.messages.clone();
        for message in &messages {
            self.apply_user_message_attachments_to_manifest(
                &mut persisted.attachment_manifest,
                "",
                message,
            )?;
        }
        self.save_sidechat_files(&persisted)?;
        self.update_sidechat_index(&persisted.metadata)
    }

    pub fn load_sidechat(&self, sidechat_id: &str) -> Result<SideChatData> {
        let thread_dir = self.thread_dir(sidechat_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(sidechat_id.to_string()));
        }
        let metadata = self.get_sidechat_metadata(sidechat_id)?;
        let messages = self.load_messages(sidechat_id)?;
        let context_window = serde_json::from_str::<ContextWindow>(&fs::read_to_string(
            context_window_path(&thread_dir),
        )?)?;
        let attachment_manifest = serde_json::from_str::<AttachmentManifest>(&fs::read_to_string(
            attachment_manifest_path(&thread_dir),
        )?)?;
        Ok(SideChatData {
            metadata,
            messages,
            context_window,
            attachment_manifest,
        })
    }

    pub fn update_sidechat_metadata(&self, metadata: &SideChatMetadata) -> Result<()> {
        if !self.thread_dir(&metadata.id).exists() {
            return Err(StorageError::ThreadNotFound(metadata.id.clone()));
        }
        self.update_sidechat_index(metadata)
    }

    pub fn set_thread_workspace(&self, thread_id: &str, workspace_id: Option<&str>) -> Result<()> {
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

        let messages = self.load_messages(thread_id)?;
        let context_window = if context_window_path(&thread_dir).exists() {
            serde_json::from_str::<ContextWindow>(&fs::read_to_string(context_window_path(
                &thread_dir,
            ))?)?
        } else {
            ContextWindow::default()
        };
        let attachment_manifest = serde_json::from_str::<AttachmentManifest>(&fs::read_to_string(
            attachment_manifest_path(&thread_dir),
        )?)?;
        let image_tone = self.get_image_tone(&metadata.image_hash);
        let reverse_image_search = self.get_reverse_image_search_cache(&metadata.image_hash)?;

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

    pub fn load_messages(&self, thread_id: &str) -> Result<Vec<ThreadMessage>> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let path = messages_path(&thread_dir);
        if !path.exists() {
            return Ok(Vec::new());
        }

        Ok(serde_json::from_str::<Vec<ThreadMessage>>(
            &fs::read_to_string(path)?,
        )?)
    }

    pub fn list_threads(&self) -> Result<Vec<ThreadMetadata>> {
        let index = self.read_index()?;
        let mut threads = index
            .workspaces
            .into_iter()
            .flat_map(|workspace| workspace.threads.into_values())
            .chain(index.unassigned_threads.into_values())
            .collect::<Vec<_>>();
        threads.sort_by_key(|thread| std::cmp::Reverse(thread.updated_at));
        Ok(threads)
    }

    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceMetadata>> {
        Ok(self.read_index()?.workspaces)
    }

    pub fn delete_thread(&self, thread_id: &str) -> Result<()> {
        self.delete_threads(&[thread_id.to_string()])
    }

    pub fn delete_threads(&self, thread_ids: &[String]) -> Result<()> {
        for thread_id in thread_ids {
            let thread_dir = self.thread_dir(thread_id);
            if thread_dir.exists() {
                fs::remove_dir_all(&thread_dir)?;
            }
        }
        self.remove_many_from_index(thread_ids)
    }

    pub fn fork_thread_latest(&self, thread_id: &str) -> Result<ThreadMetadata> {
        let source_dir = self.thread_dir(thread_id);
        if !source_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let source_workspace_id = self.get_thread_workspace_id(thread_id)?;
        let source_thread = self.load_thread(thread_id)?;
        let mut metadata = ThreadMetadata::new(
            format!("forked {}", source_thread.metadata.title),
            source_thread.metadata.image_hash.clone(),
        );
        metadata.pinned_at = None;
        let destination_dir = self.thread_dir(&metadata.id);
        copy_dir_all(&source_dir, &destination_dir)?;

        let mut forked_thread = source_thread;
        forked_thread.metadata = metadata.clone();
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
        self.save_thread_files(&forked_thread)?;
        self.update_index_in_workspace(&metadata, source_workspace_id.as_deref())?;
        Ok(metadata)
    }

    pub fn update_thread_metadata(&self, metadata: &ThreadMetadata) -> Result<()> {
        if !self.thread_dir(&metadata.id).exists() {
            return Err(StorageError::ThreadNotFound(metadata.id.clone()));
        }
        self.update_index(metadata)?;
        Ok(())
    }

}
