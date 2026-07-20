// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::Utc;
use regex::Regex;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use crate::error::{Result, StorageError};

use super::ocr::{ensure_empty_state_asset, retain_supported_ocr_annotations_ids};
use super::paths::{
    attachment_registry_path, context_window_path, messages_path, ocr_annotations_path,
};
use super::{
    default_ocr_annotations, AttachmentRegistry, ContextWindow, OcrAnnotations,
    ReverseImageSearchCache, ThreadAttachmentKind, ThreadAttachmentRecord, ThreadData,
    ThreadMessage, ThreadMetadata, ThreadStorage, WorkspaceMetadata,
};

fn normalize_attachment_registry_key(value: &str) -> String {
    let trimmed = value.trim();
    trimmed
        .strip_prefix('<')
        .and_then(|inner| inner.strip_suffix('>'))
        .map(str::trim)
        .unwrap_or(trimmed)
        .to_string()
}

fn attachment_kind_and_mime(path: &str) -> (ThreadAttachmentKind, &'static str) {
    let extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "png" => (ThreadAttachmentKind::ImageUpload, "image/png"),
        "jpg" | "jpeg" => (ThreadAttachmentKind::ImageUpload, "image/jpeg"),
        "webp" => (ThreadAttachmentKind::ImageUpload, "image/webp"),
        "gif" => (ThreadAttachmentKind::ImageUpload, "image/gif"),
        "bmp" => (ThreadAttachmentKind::ImageUpload, "image/bmp"),
        "svg" => (ThreadAttachmentKind::ImageUpload, "image/svg+xml"),
        "pdf" => (ThreadAttachmentKind::DocumentUpload, "application/pdf"),
        "doc" => (ThreadAttachmentKind::DocumentUpload, "application/msword"),
        "docx" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        "xls" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.ms-excel",
        ),
        "xlsx" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
        "ppt" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.ms-powerpoint",
        ),
        "pptx" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
        "rtf" => (ThreadAttachmentKind::DocumentUpload, "application/rtf"),
        "odt" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.oasis.opendocument.text",
        ),
        "ods" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.oasis.opendocument.spreadsheet",
        ),
        "odp" => (
            ThreadAttachmentKind::DocumentUpload,
            "application/vnd.oasis.opendocument.presentation",
        ),
        _ => (ThreadAttachmentKind::TextLocal, "text/plain"),
    }
}

fn registry_source_for_path(thread: &ThreadData, path: &str) -> Option<String> {
    let target = normalize_attachment_registry_key(path);
    let target_name = Path::new(&target).file_name();

    thread
        .attachment_registry
        .get(&target)
        .or_else(|| {
            thread.attachment_registry.values().find(|record| {
                normalize_attachment_registry_key(&record.cas_path) == target
                    || target_name
                        .is_some_and(|name| Path::new(&record.cas_path).file_name() == Some(name))
            })
        })
        .and_then(|record| record.source_path.as_deref())
        .map(str::trim)
        .filter(|source_path| !source_path.is_empty())
        .map(str::to_string)
}

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

fn unwrap_current_attachment_destination(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let unwrapped = trimmed
        .strip_prefix('<')
        .and_then(|value| value.strip_suffix('>'))
        .map(str::trim)
        .unwrap_or(trimmed);
    let rest = unwrapped.strip_prefix("file://")?;

    if let Some(path) = rest.strip_prefix('/') {
        if path.as_bytes().get(1) == Some(&b':') {
            return Some(path.to_string());
        }
    }

    Some(rest.to_string())
}

fn extract_current_attachment_paths(text: &str) -> BTreeSet<String> {
    let re = Regex::new(r"\[[^\]\n]+\]\((<[^>\n]+>|[^)\n]+)\)")
        .expect("current attachment link regex must compile");
    re.captures_iter(text)
        .filter_map(|capture| capture.get(1))
        .filter_map(|raw| unwrap_current_attachment_destination(raw.as_str()))
        .collect()
}

fn retain_referenced_attachments(thread: &mut ThreadData) {
    let retained_paths = thread
        .messages
        .iter()
        .flat_map(|message| extract_current_attachment_paths(&message.content))
        .collect::<BTreeSet<_>>();

    thread.attachment_registry.retain(|key, record| {
        retained_paths.contains(key) || retained_paths.contains(&record.cas_path)
    });
}

impl ThreadStorage {
    /// Persist the original filesystem location for a CAS-backed attachment.
    pub fn register_attachment_source(
        &self,
        thread_id: &str,
        cas_path: &str,
        source_path: &str,
        display_name: Option<&str>,
    ) -> Result<()> {
        let mut thread = self.load_thread(thread_id)?;
        let key = normalize_attachment_registry_key(cas_path);
        let canonical_source = fs::canonicalize(source_path)
            .unwrap_or_else(|_| Path::new(source_path).to_path_buf())
            .to_string_lossy()
            .to_string();
        let fallback_name = Path::new(&canonical_source)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("attachment");
        let display_name = display_name
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or(fallback_name)
            .to_string();
        let (kind, mime_type) = attachment_kind_and_mime(&key);
        let now = Utc::now();

        match thread.attachment_registry.get_mut(&key) {
            Some(record) => {
                record.cas_path = key;
                record.source_path = Some(canonical_source);
                record.display_name = display_name;
                record.kind = kind;
                record.mime_type = mime_type.to_string();
                record.last_seen_at = now;
            }
            None => {
                thread.attachment_registry.insert(
                    key.clone(),
                    ThreadAttachmentRecord {
                        cas_path: key,
                        source_path: Some(canonical_source),
                        display_name,
                        kind,
                        mime_type: mime_type.to_string(),
                        provider_file: None,
                        last_seen_at: now,
                        last_recalled_at: None,
                    },
                );
            }
        }

        self.save_thread(&thread)
    }

    /// Find an attachment's recorded original path, preferring the active thread.
    pub fn get_attachment_source_path(
        &self,
        cas_path: &str,
        thread_id: Option<&str>,
    ) -> Result<Option<String>> {
        if let Some(thread_id) = thread_id {
            if let Ok(thread) = self.load_thread(thread_id) {
                if let Some(source_path) = registry_source_for_path(&thread, cas_path) {
                    return Ok(Some(source_path));
                }
            }
        }

        for metadata in self.list_threads()? {
            if thread_id.is_some_and(|thread_id| thread_id == metadata.id) {
                continue;
            }
            if let Ok(thread) = self.load_thread(&metadata.id) {
                if let Some(source_path) = registry_source_for_path(&thread, cas_path) {
                    return Ok(Some(source_path));
                }
            }
        }

        Ok(None)
    }

    /// Return source paths from attachment registries for renderer hydration.
    pub fn list_attachment_sources(
        &self,
        thread_id: Option<&str>,
    ) -> Result<BTreeMap<String, String>> {
        let mut sources = BTreeMap::new();
        let thread_ids = if let Some(thread_id) = thread_id {
            vec![thread_id.to_string()]
        } else {
            self.list_threads()?
                .into_iter()
                .map(|metadata| metadata.id)
                .collect()
        };

        for thread_id in thread_ids {
            let Ok(thread) = self.load_thread(&thread_id) else {
                continue;
            };
            for record in thread.attachment_registry.values() {
                let Some(source_path) = record
                    .source_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|source_path| !source_path.is_empty())
                else {
                    continue;
                };
                sources
                    .entry(record.cas_path.clone())
                    .or_insert_with(|| source_path.to_string());
            }
        }

        Ok(sources)
    }

    fn save_thread_files(&self, thread: &ThreadData) -> Result<()> {
        let thread_dir = self.thread_dir(&thread.metadata.id);
        fs::create_dir_all(&thread_dir)?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut ocr_data = thread.ocr_data.clone();
        ensure_empty_state_asset(&mut ocr_data);
        retain_supported_ocr_annotations_ids(&mut ocr_data);
        fs::write(&ocr_path, serde_json::to_string_pretty(&ocr_data)?)?;

        let context_path = context_window_path(&thread_dir);
        if !context_path.exists() {
            fs::write(
                &context_path,
                serde_json::to_string_pretty(&thread.context_window)?,
            )?;
        }

        let reverse_path = super::paths::reverse_image_search_path(&thread_dir);
        if !reverse_path.exists() {
            fs::write(
                &reverse_path,
                serde_json::to_string_pretty(&thread.reverse_image_search)?,
            )?;
        }

        let messages_path = messages_path(&thread_dir);
        fs::write(
            &messages_path,
            serde_json::to_string_pretty(&thread.messages)?,
        )?;

        let attachment_registry_path = attachment_registry_path(&thread_dir);
        if !thread.attachment_registry.is_empty() {
            fs::write(
                &attachment_registry_path,
                serde_json::to_string_pretty(&thread.attachment_registry)?,
            )?;
        } else if attachment_registry_path.exists() {
            fs::remove_file(&attachment_registry_path)?;
        }

        Ok(())
    }

    /// Save a new thread to the device workspace or update it in its current workspace.
    pub fn save_thread(&self, thread: &ThreadData) -> Result<()> {
        self.save_thread_files(thread)?;
        self.update_index(&thread.metadata)
    }

    /// Save a new thread in a specific workspace.
    pub fn save_thread_in_workspace(&self, thread: &ThreadData, workspace_id: &str) -> Result<()> {
        self.save_thread_files(thread)?;
        self.update_index_in_workspace(&thread.metadata, workspace_id)
    }

    /// Move an existing thread to a workspace without rewriting its thread files.
    pub fn set_thread_workspace(&self, thread_id: &str, workspace_id: &str) -> Result<()> {
        let metadata = self.get_index_metadata(thread_id)?;
        self.update_index_in_workspace(&metadata, workspace_id)
    }

    /// Load a thread by ID.
    pub fn load_thread(&self, thread_id: &str) -> Result<ThreadData> {
        let thread_dir = self.thread_dir(thread_id);

        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let metadata = self.get_index_metadata(thread_id)?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations_changed = false;
        let mut ocr_data: OcrAnnotations = if ocr_path.exists() {
            let json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&json)?
        } else {
            default_ocr_annotations()
        };

        if ensure_empty_state_asset(&mut ocr_data) {
            annotations_changed = true;
        }
        if retain_supported_ocr_annotations_ids(&mut ocr_data) {
            annotations_changed = true;
        }
        if annotations_changed {
            fs::write(&ocr_path, serde_json::to_string_pretty(&ocr_data)?)?;
        }

        let messages_path = messages_path(&thread_dir);
        let messages = if messages_path.exists() {
            let json = fs::read_to_string(&messages_path)?;
            serde_json::from_str::<Vec<ThreadMessage>>(&json)?
        } else {
            Vec::new()
        };

        let context_path = context_window_path(&thread_dir);
        let context_window = if context_path.exists() {
            let json = fs::read_to_string(&context_path)?;
            serde_json::from_str::<ContextWindow>(&json)?
        } else {
            let context = ContextWindow::default();
            fs::write(&context_path, serde_json::to_string_pretty(&context)?)?;
            context
        };

        let reverse_path = super::paths::reverse_image_search_path(&thread_dir);
        let reverse_image_search = if reverse_path.exists() {
            let json = fs::read_to_string(&reverse_path)?;
            serde_json::from_str::<ReverseImageSearchCache>(&json)?
        } else {
            let cache = ReverseImageSearchCache::default();
            fs::write(&reverse_path, serde_json::to_string_pretty(&cache)?)?;
            cache
        };

        let attachment_registry_path = attachment_registry_path(&thread_dir);
        let attachment_registry = if attachment_registry_path.exists() {
            let json = fs::read_to_string(&attachment_registry_path)?;
            serde_json::from_str::<AttachmentRegistry>(&json)?
        } else {
            AttachmentRegistry::new()
        };

        Ok(ThreadData {
            metadata,
            messages,
            ocr_data,
            context_window,
            reverse_image_search,
            attachment_registry,
            image_tone: Some("d".to_string()),
            image_brief: Some("summary of the image here".to_string()),
        })
    }

    /// Save image tone placeholder. Object manifests will own this value.
    pub fn save_image_tone(&self, thread_id: &str, _tone: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }
        Ok(())
    }

    /// Save image brief placeholder. Object manifests will own this value.
    pub fn save_image_brief(&self, thread_id: &str, _brief: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }
        Ok(())
    }

    /// List all threads, metadata only.
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

    /// List workspaces in sidebar order with their nested thread metadata.
    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceMetadata>> {
        Ok(self.read_index()?.workspaces)
    }

    /// Delete a thread by ID.
    pub fn delete_thread(&self, thread_id: &str) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);

        if thread_dir.exists() {
            fs::remove_dir_all(&thread_dir)?;
        }

        self.remove_from_index(thread_id)?;
        Ok(())
    }

    /// Fork a thread by copying its folder and trimming message-local sidecars.
    pub fn fork_thread(&self, thread_id: &str, message_index: usize) -> Result<ThreadMetadata> {
        let source_dir = self.thread_dir(thread_id);
        if !source_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let source_workspace_id = self.get_thread_workspace_id(thread_id)?;
        let source_thread = self.load_thread(thread_id)?;
        let retained_len = message_index.checked_add(1).ok_or_else(|| {
            StorageError::InvalidThreadFork(format!("message index {} is too large", message_index))
        })?;

        if retained_len > source_thread.messages.len() {
            return Err(StorageError::InvalidThreadFork(format!(
                "message index {} is outside thread {}",
                message_index, thread_id
            )));
        }

        let mut metadata = ThreadMetadata::new(
            format!("forked {}", source_thread.metadata.title),
            source_thread.metadata.image_hash.clone(),
        );
        metadata.pinned_at = None;

        let destination_dir = self.thread_dir(&metadata.id);
        copy_dir_all(&source_dir, &destination_dir)?;

        let source_had_attachment_registry = attachment_registry_path(&source_dir).exists();
        let mut forked_thread = source_thread;
        forked_thread.metadata = metadata.clone();
        forked_thread.messages.truncate(retained_len);
        retain_referenced_attachments(&mut forked_thread);

        self.save_thread_in_workspace(&forked_thread, &source_workspace_id)?;

        if source_had_attachment_registry && forked_thread.attachment_registry.is_empty() {
            fs::write(
                attachment_registry_path(&destination_dir),
                serde_json::to_string_pretty(&forked_thread.attachment_registry)?,
            )?;
        }

        Ok(metadata)
    }

    /// Update thread metadata.
    pub fn update_thread_metadata(&self, metadata: &ThreadMetadata) -> Result<()> {
        let thread_dir = self.thread_dir(&metadata.id);

        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(metadata.id.clone()));
        }

        self.update_index(metadata)?;
        Ok(())
    }

    /// Append a message to a thread.
    pub fn append_message(&self, thread_id: &str, message: &ThreadMessage) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let messages_path = messages_path(&thread_dir);
        let mut messages: Vec<ThreadMessage> = if messages_path.exists() {
            let json = fs::read_to_string(&messages_path)?;
            serde_json::from_str(&json)?
        } else {
            Vec::new()
        };

        messages.push(message.clone());
        fs::write(&messages_path, serde_json::to_string_pretty(&messages)?)?;

        if let Ok(mut metadata) = self.get_index_metadata(thread_id) {
            metadata.updated_at = chrono::Utc::now();
            self.update_index(&metadata)?;
        }

        Ok(())
    }
}
