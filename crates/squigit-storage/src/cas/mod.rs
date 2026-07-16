// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content-addressable storage for images and generic files.

use std::fs::{self, File};
use std::io::{Read, Write};

use crate::error::{Result, StorageError};
use crate::threads::ThreadStorage;

mod types;

pub use types::StoredImage;

impl ThreadStorage {
    /// Store image bytes using content-addressable storage.
    ///
    /// Returns the hash and path to the stored image.
    /// If the image already exists with the same hash, returns the existing path.
    pub fn store_image(&self, bytes: &[u8], explicit_tone: Option<String>) -> Result<StoredImage> {
        if bytes.is_empty() {
            return Err(StorageError::EmptyImage);
        }

        let hash = blake3::hash(bytes).to_hex().to_string();
        let prefix = &hash[..2];
        let subdir = self.objects_dir.join(prefix);
        fs::create_dir_all(&subdir)?;

        let file_path = subdir.join(format!("{}.png", hash));
        let tone_path = subdir.join(format!("{}.tone", hash));

        let explicit_tone = explicit_tone
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        let mut tone = explicit_tone.clone().unwrap_or_else(|| "d".to_string());

        if !file_path.exists() {
            let mut file = File::create(&file_path)?;
            file.write_all(bytes)?;
            let _ = fs::write(&tone_path, &tone);
        } else if let Some(explicit) = explicit_tone {
            tone = explicit;
            let _ = fs::write(&tone_path, &tone);
        } else if tone_path.exists() {
            if let Ok(cached) = fs::read_to_string(&tone_path) {
                let trimmed = cached.trim();
                if !trimmed.is_empty() {
                    tone = trimmed.to_string();
                }
            }
        }

        Ok(StoredImage {
            hash,
            path: file_path.to_string_lossy().to_string(),
            tone: Some(tone),
        })
    }

    /// Store an image from a file path.
    pub fn store_image_from_path(
        &self,
        path: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        self.store_image(&buffer, explicit_tone)
    }

    /// Store a generic file using content-addressable storage, preserving the extension.
    pub fn store_file(
        &self,
        bytes: &[u8],
        extension: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        if bytes.is_empty() {
            return Err(StorageError::EmptyImage);
        }

        let hash = blake3::hash(bytes).to_hex().to_string();
        let prefix = &hash[..2];
        let subdir = self.objects_dir.join(prefix);
        fs::create_dir_all(&subdir)?;

        let ext = if extension.is_empty() {
            "bin"
        } else {
            extension
        };
        let is_image_ext = ext == "png" || ext == "jpeg" || ext == "jpg" || ext == "webp";
        let file_path = subdir.join(format!("{}.{}", hash, ext));
        let tone_path = subdir.join(format!("{}.tone", hash));
        let explicit_tone = explicit_tone
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        let mut tone = explicit_tone.clone().unwrap_or_else(|| "d".to_string());

        if !file_path.exists() {
            let mut file = File::create(&file_path)?;
            file.write_all(bytes)?;

            if is_image_ext {
                let _ = fs::write(&tone_path, &tone);
            }
        } else if is_image_ext {
            if let Some(explicit) = explicit_tone {
                tone = explicit;
                let _ = fs::write(&tone_path, &tone);
            } else if tone_path.exists() {
                if let Ok(cached) = fs::read_to_string(&tone_path) {
                    let trimmed = cached.trim();
                    if !trimmed.is_empty() {
                        tone = trimmed.to_string();
                    }
                }
            }
        } else if tone_path.exists() {
            if let Ok(cached) = fs::read_to_string(&tone_path) {
                let trimmed = cached.trim();
                if !trimmed.is_empty() {
                    tone = trimmed.to_string();
                }
            }
        }

        Ok(StoredImage {
            hash,
            path: file_path.to_string_lossy().to_string(),
            tone: Some(tone),
        })
    }

    /// Store a file from a filesystem path, preserving the original extension.
    pub fn store_file_from_path(
        &self,
        path: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        let source = std::path::Path::new(path);
        let extension = source
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mut file = File::open(path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        self.store_file(&buffer, &extension, explicit_tone)
    }

    /// Get the path to a stored PNG image by hash.
    pub fn get_image_path(&self, hash: &str) -> Result<String> {
        let prefix = hash.get(..2).ok_or(StorageError::InvalidHash)?;
        let file_path = self.objects_dir.join(prefix).join(format!("{}.png", hash));

        if file_path.exists() {
            Ok(file_path.to_string_lossy().to_string())
        } else {
            Err(StorageError::ImageNotFound(hash.to_string()))
        }
    }

    /// Get the cached tone for a stored image by hash.
    pub fn get_image_tone(&self, hash: &str) -> Option<String> {
        let prefix = hash.get(..2)?;
        let tone_path = self.objects_dir.join(prefix).join(format!("{}.tone", hash));
        if tone_path.exists() {
            if let Ok(cached) = fs::read_to_string(&tone_path) {
                let trimmed = cached.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        None
    }
}
