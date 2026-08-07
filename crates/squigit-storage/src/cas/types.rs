// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const OBJECT_MANIFEST_SCHEMA_VERSION: u32 = 3;

/// Persistent pointer from one immutable source document to its generated PDF object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocumentConversion {
    pub source_hash: String,
    pub source_extension: String,
    pub pdf_hash: String,
    pub recipe: String,
}

/// How an object is exposed to the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AttachmentFileType {
    TextLocal,
    ImageUpload,
    DocumentUpload,
}

/// Content-derived metadata shared by every thread that references an object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct ObjectFileContext {
    pub file_type: AttachmentFileType,
    pub image_tone: Option<String>,
    pub file_brief: Option<String>,
}

/// A Gemini Files API handle scoped to one stable API-key identity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct ObjectRemote {
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
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct ObjectManifest {
    pub schema: u32,
    pub file_context: ObjectFileContext,
    #[serde(deserialize_with = "deserialize_object_remotes")]
    pub object_remotes: BTreeMap<String, ObjectRemote>,
}

impl ObjectManifest {
    pub fn new(file_context: ObjectFileContext) -> Self {
        Self {
            schema: OBJECT_MANIFEST_SCHEMA_VERSION,
            file_context,
            object_remotes: BTreeMap::new(),
        }
    }

    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.schema != OBJECT_MANIFEST_SCHEMA_VERSION {
            return Err(format!(
                "expected object manifest schema {OBJECT_MANIFEST_SCHEMA_VERSION}"
            ));
        }
        for remote_id in self.object_remotes.keys() {
            validate_object_remote_id(remote_id)?;
        }
        Ok(())
    }
}

fn validate_object_remote_id(remote_id: &str) -> std::result::Result<(), String> {
    if remote_id.len() == 64
        && remote_id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err("object remote ID must be exactly 64 lowercase hexadecimal characters".to_string())
    }
}

fn deserialize_object_remotes<'de, D>(
    deserializer: D,
) -> std::result::Result<BTreeMap<String, ObjectRemote>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let remotes = BTreeMap::<String, ObjectRemote>::deserialize(deserializer)?;
    for remote_id in remotes.keys() {
        validate_object_remote_id(remote_id).map_err(serde::de::Error::custom)?;
    }
    Ok(remotes)
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
