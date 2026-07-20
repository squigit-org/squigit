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

/// A single thread message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadMessage {
    /// Role: "user" or "assistant".
    pub role: String,
    /// Message content (markdown).
    pub content: String,
    /// When the message was sent.
    pub timestamp: DateTime<Utc>,
    /// Optional structured citation chips shown under assistant responses.
    #[serde(default)]
    pub citations: Vec<CitationSource>,
    /// Optional tool call timeline metadata for this message.
    #[serde(default)]
    pub tool_steps: Vec<ToolStep>,
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
}

impl ThreadMessage {
    /// Create a new user message.
    pub fn user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
            timestamp: Utc::now(),
            citations: Vec::new(),
            tool_steps: Vec::new(),
        }
    }

    /// Create a new assistant message.
    pub fn assistant(content: String) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
            timestamp: Utc::now(),
            citations: Vec::new(),
            tool_steps: Vec::new(),
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

fn default_image_tone() -> Option<String> {
    Some("d".to_string())
}

fn default_image_brief() -> Option<String> {
    Some("summary of the image here".to_string())
}

fn now_utc() -> DateTime<Utc> {
    Utc::now()
}

/// Attachment kinds tracked per thread.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThreadAttachmentKind {
    TextLocal,
    ImageUpload,
    DocumentUpload,
}

/// Persisted provider-hosted file handle for a tracked attachment.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ThreadAttachmentProviderFile {
    pub file_uri: String,
    pub file_name: String,
    pub mime_type: String,
    pub uploaded_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    #[serde(default)]
    pub last_validated_at: Option<DateTime<Utc>>,
}

/// Per-thread tracked attachment metadata keyed by its stable citation path.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ThreadAttachmentRecord {
    pub cas_path: String,
    pub display_name: String,
    pub kind: ThreadAttachmentKind,
    pub mime_type: String,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub provider_file: Option<ThreadAttachmentProviderFile>,
    #[serde(default = "now_utc")]
    pub last_seen_at: DateTime<Utc>,
    #[serde(default)]
    pub last_recalled_at: Option<DateTime<Utc>>,
}

/// Attachment registry persisted alongside thread data, keyed by citation path.
pub type AttachmentRegistry = BTreeMap<String, ThreadAttachmentRecord>;

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
    /// Per-thread tracked attachments keyed by CAS path.
    #[serde(default)]
    pub attachment_registry: AttachmentRegistry,
    /// Image tone from the object manifest. Placeholder until manifests land.
    #[serde(default = "default_image_tone")]
    pub image_tone: Option<String>,
    /// Generated concise text description of the session's startup image.
    #[serde(default = "default_image_brief")]
    pub image_brief: Option<String>,
}

impl ThreadData {
    /// Create new thread data with metadata.
    pub fn new(metadata: ThreadMetadata) -> Self {
        Self {
            metadata,
            messages: Vec::new(),
            ocr_data: default_ocr_annotations(),
            context_window: ContextWindow::default(),
            reverse_image_search: ReverseImageSearchCache::default(),
            attachment_registry: BTreeMap::new(),
            image_tone: default_image_tone(),
            image_brief: default_image_brief(),
        }
    }
}
