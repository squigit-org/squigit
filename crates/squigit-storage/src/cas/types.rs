// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

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
