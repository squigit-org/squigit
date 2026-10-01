// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const OBJECT_MANIFEST_SCHEMA_VERSION: u32 = 2;

/// Persistent pointer from one immutable source document to its generated PDF object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocumentConversion {
    pub source_hash: String,
    pub source_extension: String,
    pub pdf_hash: String,
    pub recipe: String,
}

/// Persistent pointer from one immutable source image to its model-facing rendition object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImageRendition {
    pub source_hash: String,
    pub rendition_hash: String,
    pub recipe: String,
}

/// How an object is exposed to the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AttachmentFileType {
    Image,
    Document,
}

/// Content-derived metadata shared by every thread that references an object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct ObjectFileContext {
    pub file_type: AttachmentFileType,
    pub image_tone: Option<String>,
    pub file_brief: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReverseImageSearchCache {
    pub imgbb_url: String,
    pub google_lens_url: String,
    pub created_at: DateTime<Utc>,
}

/// Metadata stored beside one immutable CAS blob.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct ObjectManifest {
    pub schema: u32,
    pub file_context: ObjectFileContext,
    pub reverse_image_search: Option<ReverseImageSearchCache>,
}

impl ObjectManifest {
    pub fn new(file_context: ObjectFileContext) -> Self {
        Self {
            schema: OBJECT_MANIFEST_SCHEMA_VERSION,
            file_context,
            reverse_image_search: None,
        }
    }

    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.schema != OBJECT_MANIFEST_SCHEMA_VERSION {
            return Err(format!(
                "expected object manifest schema {OBJECT_MANIFEST_SCHEMA_VERSION}"
            ));
        }
        if self.reverse_image_search.as_ref().is_some_and(|cache| {
            cache.imgbb_url.trim().is_empty() || cache.google_lens_url.trim().is_empty()
        }) {
            return Err("reverse image search cache URLs must not be empty".to_string());
        }
        Ok(())
    }
}

/// Result of storing an object in content-addressable storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredImage {
    /// BLAKE3 hash of the image or file content.
    pub hash: String,
    /// Absolute path to the stored object file.
    pub path: String,
    /// Image tone detected when storing the local rendition.
    #[serde(default)]
    pub tone: Option<String>,
}
