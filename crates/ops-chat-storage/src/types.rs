// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Type definitions for chat storage.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Metadata for a chat session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMetadata {
    /// Unique identifier for the chat.
    pub id: String,
    /// Display title for the chat.
    pub title: String,
    /// When the chat was created.
    pub created_at: DateTime<Utc>,
    /// When the chat was last updated.
    pub updated_at: DateTime<Utc>,
    /// BLAKE3 hash of the associated image.
    pub image_hash: String,
    /// Whether the chat is pinned.
    #[serde(default)]
    pub is_pinned: bool,
    /// Whether the chat is starred (favorite).
    #[serde(default)]
    pub is_starred: bool,
    /// Optional project ID for grouping.
    #[serde(default)]
    pub project_id: Option<String>,
    /// When the chat was pinned.
    #[serde(default)]
    pub pinned_at: Option<DateTime<Utc>>,
}

impl ChatMetadata {
    /// Create new chat metadata with a generated ID.
    pub fn new(title: String, image_hash: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            created_at: now,
            updated_at: now,
            image_hash,
            is_pinned: false,
            is_starred: false,
            project_id: None,
            pinned_at: None,
        }
    }
}

/// A single chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// Role: "user" or "assistant".
    pub role: String,
    /// Message content (markdown).
    pub content: String,
    /// When the message was sent.
    pub timestamp: DateTime<Utc>,
}

impl ChatMessage {
    /// Create a new user message.
    pub fn user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
            timestamp: Utc::now(),
        }
    }

    /// Create a new assistant message.
    pub fn assistant(content: String) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
            timestamp: Utc::now(),
        }
    }
}

/// OCR data for an image region.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrRegion {
    /// Extracted text.
    pub text: String,
    /// Bounding box coordinates.
    pub bbox: Vec<Vec<i32>>,
}

/// Complete chat data including messages and OCR.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatData {
    /// Chat metadata.
    pub metadata: ChatMetadata,
    /// Chat messages.
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    /// OCR data from the image.
    #[serde(default)]
    pub ocr_data: Vec<OcrRegion>,
    /// Optional imgbb upload URL.
    #[serde(default)]
    pub imgbb_url: Option<String>,
}

impl ChatData {
    /// Create new chat data with metadata.
    pub fn new(metadata: ChatMetadata) -> Self {
        Self {
            metadata,
            messages: Vec::new(),
            ocr_data: Vec::new(),
            imgbb_url: None,
        }
    }
}

/// Project for grouping chats.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// Unique project ID.
    pub id: String,
    /// Project name.
    pub name: String,
    /// When the project was created.
    pub created_at: DateTime<Utc>,
}

impl Project {
    /// Create a new project.
    pub fn new(name: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: Utc::now(),
        }
    }
}

/// Result of storing an image.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredImage {
    /// BLAKE3 hash of the image (content ID).
    pub hash: String,
    /// Absolute path to the stored image file.
    pub path: String,
}
