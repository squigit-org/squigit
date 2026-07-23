// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Type definitions for thread storage.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use uuid::Uuid;

pub const EMPTY_STATE_ASSET_ID: &str = "__empty_state_asset__";

/// Metadata for a thread session stored in the thread index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadMetadata {
    /// Unique identifier for the thread.
    pub id: String,
    /// Display title for the thread.
    pub title: String,
    /// When the thread was created.
    pub created_at: DateTime<Utc>,
    /// When the thread was last updated.
    pub updated_at: DateTime<Utc>,
    /// BLAKE3 hash of the associated image.
    pub image_hash: String,
    /// When the thread was pinned, or `None` when it is not pinned.
    pub pinned_at: Option<DateTime<Utc>>,
}

impl ThreadMetadata {
    /// Create new thread metadata with a generated ID.
    pub fn new(title: String, image_hash: String) -> Self {
        let now = Utc::now();
        // Generate ID: YYYYMMDD-HHMMSS-<UUID_SUFFIX>
        // Use first 8 chars of a UUID for randomness
        let date_part = now.format("%Y%m%d-%H%M%S").to_string();
        let uuid_part = Uuid::new_v4().to_string();
        let id = format!("{}-{}", date_part, &uuid_part[..8]);

        Self {
            id,
            title,
            created_at: now,
            updated_at: now,
            image_hash,
            pinned_at: None,
        }
    }
}

/// A workspace groups threads under one AI sandbox path.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    /// Unique identifier for the workspace.
    pub id: String,
    /// Workspace name displayed in the sidebar.
    pub name: String,
    /// AI sandbox path. The device workspace has no path.
    pub path: Option<String>,
    /// Thread metadata keyed by thread ID.
    pub threads: BTreeMap<String, ThreadMetadata>,
}

impl WorkspaceMetadata {
    /// Create a workspace with a generated ID.
    pub fn new(name: String, path: Option<String>) -> Self {
        Self {
            id: format!("workspace-{}", Uuid::new_v4()),
            name,
            path,
            threads: BTreeMap::new(),
        }
    }

    /// Create the pathless workspace representing the current device.
    pub fn device_default() -> Self {
        #[cfg(target_os = "macos")]
        let name = "This Mac";
        #[cfg(not(target_os = "macos"))]
        let name = "This PC";

        Self::new(name.to_string(), None)
    }
}

/// A CAS object referenced by one user message.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MessageAttachment {
    pub attachment_hash: String,
    pub source_path: Option<String>,
}

/// A persisted message with a strict role-specific JSON shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum ThreadMessage {
    User {
        id: String,
        content: String,
        timestamp: DateTime<Utc>,
        attachments: Vec<MessageAttachment>,
    },
    Assistant {
        id: String,
        content: String,
        timestamp: DateTime<Utc>,
        citations: Vec<CitationSource>,
        tool_steps: Vec<ToolStep>,
    },
}

/// Structured citation source metadata persisted with a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CitationSource {
    pub title: String,
    pub url: String,
    pub summary: String,
    #[serde(default)]
    pub favicon_url: Option<String>,
    #[serde(default)]
    pub favicon_base64: Option<String>,
}

/// Tool-step metadata persisted with a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStep {
    pub id: String,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub args: serde_json::Value,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default, rename = "startedAtMs")]
    pub started_at_ms: Option<u64>,
    #[serde(default, rename = "endedAtMs")]
    pub ended_at_ms: Option<u64>,
}

impl ThreadMessage {
    fn new_id() -> String {
        format!("msg_{}", Uuid::new_v4())
    }

    /// Create a new user message.
    pub fn user(content: String) -> Self {
        Self::user_with_attachments(content, Vec::new())
    }

    /// Create a new user message with structured CAS attachment hashes.
    pub fn user_with_attachments(content: String, attachments: Vec<MessageAttachment>) -> Self {
        Self::User {
            id: Self::new_id(),
            content,
            timestamp: Utc::now(),
            attachments,
        }
    }

    /// Create a new assistant message.
    pub fn assistant(content: String) -> Self {
        Self::Assistant {
            id: Self::new_id(),
            content,
            timestamp: Utc::now(),
            citations: Vec::new(),
            tool_steps: Vec::new(),
        }
    }

    pub fn id(&self) -> &str {
        match self {
            Self::User { id, .. } | Self::Assistant { id, .. } => id,
        }
    }

    pub fn role(&self) -> &'static str {
        match self {
            Self::User { .. } => "user",
            Self::Assistant { .. } => "assistant",
        }
    }

    pub fn content(&self) -> &str {
        match self {
            Self::User { content, .. } | Self::Assistant { content, .. } => content,
        }
    }

    pub fn timestamp(&self) -> DateTime<Utc> {
        match self {
            Self::User { timestamp, .. } | Self::Assistant { timestamp, .. } => *timestamp,
        }
    }

    pub fn attachments(&self) -> &[MessageAttachment] {
        match self {
            Self::User { attachments, .. } => attachments,
            Self::Assistant { .. } => &[],
        }
    }
}

/// OCR data for an image region.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrRegion {
    /// Extracted text.
    pub text: String,
    /// Bounding box coordinates.
    #[serde(default)]
    pub bbox: Vec<Vec<i32>>,
}

/// OCR output for a single model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrModelAnnotation {
    /// When this OCR model last finished scanning this thread image.
    #[serde(default)]
    pub scanned_at: Option<DateTime<Utc>>,
    /// Cached OCR results for this model.
    #[serde(default)]
    pub ocr_data: Vec<OcrRegion>,
}

/// OCR annotations entry.
///
/// The empty-state sentinel is stored as an empty array while real model IDs
/// store timestamped OCR data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OcrAnnotationEntry {
    EmptyState(Vec<OcrRegion>),
    Model(OcrModelAnnotation),
}

/// OCR annotations keyed by sentinel/model ID.
pub type OcrAnnotations = HashMap<String, OcrAnnotationEntry>;

pub fn default_ocr_annotations() -> OcrAnnotations {
    HashMap::from([(
        EMPTY_STATE_ASSET_ID.to_string(),
        OcrAnnotationEntry::EmptyState(Vec::new()),
    )])
}

/// LLM context window state for a thread.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ContextWindow {
    pub tokens_used: u32,
    #[serde(default)]
    pub compacted_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub compacted_context: Option<String>,
}

/// Reverse image search cache for the core thread image.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReverseImageSearchCache {
    #[serde(default)]
    pub imgbb_url: Option<String>,
    #[serde(default)]
    pub google_lens_url: Option<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
}

/// Per-thread model context for a CAS attachment.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttachmentManifestEntry {
    pub attachment_hash: String,
    pub display_name: String,
    pub file_type: crate::cas::AttachmentFileType,
    pub file_brief: Option<String>,
    pub last_mention_at: DateTime<Utc>,
}

pub type AttachmentManifest = Vec<AttachmentManifestEntry>;

/// Complete thread data including messages and OCR.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadData {
    /// Thread metadata.
    pub metadata: ThreadMetadata,
    /// Thread messages.
    #[serde(default)]
    pub messages: Vec<ThreadMessage>,
    /// OCR annotations keyed by sentinel/model ID.
    #[serde(default = "default_ocr_annotations")]
    pub ocr_data: OcrAnnotations,
    /// LLM context window state.
    #[serde(default)]
    pub context_window: ContextWindow,
    /// Reverse image search cache for the core thread image.
    #[serde(default)]
    pub reverse_image_search: ReverseImageSearchCache,
    /// Per-thread attachment context persisted in attachment_manifest.json.
    pub attachment_manifest: AttachmentManifest,
    /// Image tone resolved from the initial object's manifest.
    pub image_tone: Option<String>,
}

impl ThreadData {
    /// Create new thread data with metadata.
    pub fn new(metadata: ThreadMetadata, initial_attachment: AttachmentManifestEntry) -> Self {
        Self {
            metadata,
            messages: Vec::new(),
            ocr_data: default_ocr_annotations(),
            context_window: ContextWindow::default(),
            reverse_image_search: ReverseImageSearchCache::default(),
            attachment_manifest: vec![initial_attachment],
            image_tone: None,
        }
    }
}
