// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content-addressable storage for images and generic files.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{Result, StorageError};
use crate::threads::ThreadStorage;

mod types;

pub use types::{AttachmentFileType, ObjectFileContext, ObjectManifest, ObjectRemote, StoredImage};

const OBJECT_MANIFEST_FILE: &str = "manifest.json";

fn normalize_extension(extension: &str) -> String {
    let normalized = extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    if normalized.is_empty() {
        "bin".to_string()
    } else {
        normalized
    }
}

fn classify_extension(extension: &str) -> AttachmentFileType {
    match extension {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => AttachmentFileType::ImageUpload,
        "pdf" | "doc" | "docx" | "docm" | "xls" | "xlsx" | "xlsm" | "ppt" | "pptx" | "pptm"
        | "rtf" | "odt" | "ods" | "odp" => AttachmentFileType::DocumentUpload,
        _ => AttachmentFileType::TextLocal,
    }
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<()> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("data");
    let temporary = path.with_file_name(format!(".{file_name}.tmp-{}", uuid::Uuid::new_v4()));
    fs::write(&temporary, contents)?;
    fs::rename(temporary, path)?;
    Ok(())
}

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
        self.store_object(bytes, &hash, "png", explicit_tone)
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
        let extension = Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("png");
        let hash = blake3::hash(&buffer).to_hex().to_string();
        self.store_object(&buffer, &hash, extension, explicit_tone)
    }

    /// Store a generic file using content-addressable storage, preserving the extension.
    pub fn store_file(
        &self,
        bytes: &[u8],
        extension: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        let hash = blake3::hash(bytes).to_hex().to_string();
        self.store_object(bytes, &hash, extension, explicit_tone)
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

    fn store_object(
        &self,
        bytes: &[u8],
        hash: &str,
        extension: &str,
        explicit_tone: Option<String>,
    ) -> Result<StoredImage> {
        let extension = normalize_extension(extension);
        let object_dir = self.object_dir(hash)?;
        let existing_path = self.find_object_blob(hash).ok();
        let manifest_path = object_dir.join(OBJECT_MANIFEST_FILE);
        let new_file_context = if manifest_path.exists() {
            None
        } else {
            let file_type = classify_extension(&extension);
            let file_brief = if file_type == AttachmentFileType::TextLocal {
                Some(std::str::from_utf8(bytes)?.to_string())
            } else {
                None
            };
            Some(ObjectFileContext {
                file_type,
                image_tone: None,
                file_brief,
            })
        };
        fs::create_dir_all(&object_dir)?;
        let file_path = existing_path
            .clone()
            .unwrap_or_else(|| object_dir.join(format!("{hash}.{extension}")));
        if existing_path.is_none() {
            let mut file = File::create(&file_path)?;
            file.write_all(bytes)?;
        }

        let mut manifest = if manifest_path.exists() {
            self.load_object_manifest(hash)?
        } else {
            ObjectManifest {
                file_context: new_file_context.expect("new object context must exist"),
                object_remotes: Default::default(),
            }
        };

        if manifest.file_context.file_type == AttachmentFileType::ImageUpload {
            let tone = explicit_tone
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| manifest.file_context.image_tone.clone())
                .unwrap_or_else(|| "d".to_string());
            manifest.file_context.image_tone = Some(tone);
        }
        self.save_object_manifest(hash, &manifest)?;

        Ok(StoredImage {
            hash: hash.to_string(),
            path: file_path.to_string_lossy().to_string(),
            tone: manifest.file_context.image_tone,
        })
    }

    pub fn object_dir(&self, hash: &str) -> Result<PathBuf> {
        let prefix = hash.get(..2).ok_or(StorageError::InvalidHash)?;
        if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(StorageError::InvalidHash);
        }
        Ok(self.objects_dir.join(prefix).join(hash))
    }

    pub fn object_manifest_path(&self, hash: &str) -> Result<PathBuf> {
        Ok(self.object_dir(hash)?.join(OBJECT_MANIFEST_FILE))
    }

    pub fn find_object_blob(&self, hash: &str) -> Result<PathBuf> {
        let object_dir = self.object_dir(hash)?;
        let entries =
            fs::read_dir(&object_dir).map_err(|_| StorageError::ImageNotFound(hash.to_string()))?;
        for entry in entries {
            let path = entry?.path();
            let is_blob = path.is_file()
                && path.file_stem().and_then(|value| value.to_str()) == Some(hash)
                && path.file_name().and_then(|value| value.to_str()) != Some(OBJECT_MANIFEST_FILE);
            if is_blob {
                return Ok(path);
            }
        }
        Err(StorageError::ImageNotFound(hash.to_string()))
    }

    pub fn load_object_manifest(&self, hash: &str) -> Result<ObjectManifest> {
        let json = fs::read_to_string(self.object_manifest_path(hash)?)?;
        Ok(serde_json::from_str(&json)?)
    }

    pub fn save_object_manifest(&self, hash: &str, manifest: &ObjectManifest) -> Result<()> {
        let path = self.object_manifest_path(hash)?;
        let parent = path.parent().ok_or(StorageError::InvalidHash)?;
        fs::create_dir_all(parent)?;
        atomic_write(&path, serde_json::to_string_pretty(manifest)?.as_bytes())
    }

    /// Get the canonical blob path by hash.
    pub fn get_image_path(&self, hash: &str) -> Result<String> {
        self.find_object_blob(hash)
            .map(|path| path.to_string_lossy().to_string())
    }

    /// Get the cached tone for a stored image by hash.
    pub fn get_image_tone(&self, hash: &str) -> Option<String> {
        self.load_object_manifest(hash)
            .ok()
            .and_then(|manifest| manifest.file_context.image_tone)
    }
}
