// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Thread storage manager and thread-local persisted state.

use std::fs;
use std::path::PathBuf;

use crate::database::Database;
use crate::error::{Result, StorageError};

mod index;
mod lifecycle;
mod ocr;
mod pagination;
mod records;
pub mod types;
pub use pagination::{StoredMessagePage, StoredThreadPage, StoredWorkspacePage};

pub use types::{
    default_ocr_annotations, AssistantError, AttachmentManifest, AttachmentManifestEntry,
    CitationSource, ContextWindow, Conversation, ForkSourceKind, ForkedFrom, GroundingImage,
    GroundingResource, GroundingTool, GroundingVideo, ManifestMention, MessageAttachment,
    MessageGrounding, MessageTextCitation, OcrAnnotationEntry, OcrAnnotations, OcrModelAnnotation,
    OcrRegion, SideChatData, SideChatMetadata, ThreadData, ThreadMessage, ThreadMetadata,
    WorkspaceMetadata, DEFAULT_SIDE_CHAT_TITLE, DEFAULT_THREAD_TITLE, EMPTY_STATE_ASSET_ID,
};

/// Main storage manager for threads and content-addressed objects.
pub struct ThreadStorage {
    /// Base directory for all thread storage.
    pub(crate) base_dir: PathBuf,
    /// Directory for content-addressed objects.
    pub(crate) objects_dir: PathBuf,
    pub(crate) database: Database,
}

impl ThreadStorage {
    pub fn with_config_root(config_root: PathBuf) -> Result<Self> {
        let database = Database::new(&config_root)?;
        let base_dir = config_root.clone();
        let objects_dir = config_root.join("objects");
        fs::create_dir_all(&objects_dir)?;
        Ok(Self {
            base_dir,
            objects_dir,
            database,
        })
    }

    /// Create a new storage manager using the default global thread location.
    pub fn new() -> Result<Self> {
        let config_root = crate::paths::base_config_dir().ok_or(StorageError::NoDataDir)?;
        Self::with_config_root(config_root)
    }

    /// Get the base storage directory path.
    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    /// Get the objects directory path.
    pub fn objects_dir(&self) -> &PathBuf {
        &self.objects_dir
    }
}
