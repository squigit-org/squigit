// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;

use crate::error::{Result, StorageError};

use super::ocr::{ensure_empty_state_asset, retain_supported_ocr_annotations_ids};
use super::paths::{
    attachment_registry_path, context_window_path, messages_path, ocr_annotations_path,
};
use super::{
    AttachmentRegistry, ContextWindow, OcrAnnotations, ReverseImageSearchCache, ThreadData,
    ThreadMessage, ThreadMetadata, ThreadStorage, default_ocr_annotations,
};

impl ThreadStorage {
    /// Save a new thread or update an existing one.
    pub fn save_thread(&self, thread: &ThreadData) -> Result<()> {
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

        self.update_index(&thread.metadata)?;
        Ok(())
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
        if !self.index_path.exists() {
            return Ok(Vec::new());
        }

        let mut threads: Vec<ThreadMetadata> = self.read_index()?.into_values().collect();
        threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(threads)
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
