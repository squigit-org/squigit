// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// How an object is exposed to the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentFileType {
    TextLocal,
    ImageUpload,
    DocumentUpload,
}

/// Content-derived metadata shared by every thread that references an object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ObjectFileContext {
    pub file_type: AttachmentFileType,
    pub image_tone: Option<String>,
    pub file_brief: Option<String>,
}

/// A Gemini Files API handle scoped to one stable API-key identity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ObjectRemote {
    pub encrypted_key_ref: String,
    pub file_uri: String,
    /// Gemini resource name, for example `files/abc123`.
    pub file_name: String,
    pub mime_type: String,
    pub uploaded_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub validated_at: DateTime<Utc>,
}

/// Metadata stored beside one immutable CAS blob.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ObjectManifest {
    pub file_context: ObjectFileContext,
    pub object_remotes: BTreeMap<String, ObjectRemote>,
}

/// Result of storing an object in content-addressable storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredImage {
    /// BLAKE3 hash of the image or file content.
    pub hash: String,
    /// Absolute path to the stored object file.
    pub path: String,
    /// Image tone detected upon upload.
    #[serde(default)]
    pub tone: Option<String>,
}
