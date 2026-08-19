// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content-addressable storage for images and generic files.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use fs2::FileExt;

use crate::error::{Result, StorageError};
use crate::threads::ThreadStorage;

mod types;

pub use types::{
    AttachmentFileType, DocumentConversion, ObjectFileContext, ObjectManifest, ObjectRemote,
    ReverseImageSearchCache, StoredImage, OBJECT_MANIFEST_SCHEMA_VERSION,
};

const OBJECT_MANIFEST_FILE: &str = "manifest.json";
const DOCUMENT_CONVERSIONS_DIR: &str = "document-conversions";
const OBJECT_MANIFEST_LOCK_FILE: &str = "manifest.lock";

pub struct ObjectManifestLock {
    file: File,
}

impl Drop for ObjectManifestLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

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

fn validate_hash(hash: &str) -> Result<()> {
    if hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(StorageError::InvalidHash)
    }
}

fn classify_extension(extension: &str) -> AttachmentFileType {
    match extension {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => AttachmentFileType::ImageUpload,
        "pdf" => AttachmentFileType::DocumentUpload,
        _ => AttachmentFileType::TextLocal,
    }
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<()> {
    reject_symlink_or_non_regular(path)?;
    let parent = path.parent().ok_or(StorageError::InvalidHash)?;
    ensure_private_directory(parent)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("data");
    let temporary = path.with_file_name(format!(".{file_name}.tmp-{}", uuid::Uuid::new_v4()));
    let result = (|| -> Result<()> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);

        crate::secure_file::replace_file(&temporary, path)?;
        set_private_file_permissions(path)?;
        crate::secure_file::sync_parent(parent)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn reject_symlink_or_non_regular(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(StorageError::KeyStore(format!(
                "refusing unsafe CAS metadata target: {}",
                path.display()
            )))
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn ensure_private_directory(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(StorageError::KeyStore(format!(
            "refusing unsafe CAS directory: {}",
            path.display()
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn set_private_file_permissions(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
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
            ObjectManifest::new(new_file_context.expect("new object context must exist"))
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
        validate_hash(hash)?;
        let prefix = hash.get(..2).ok_or(StorageError::InvalidHash)?;
        Ok(self.objects_dir.join(prefix).join(hash))
    }

    fn document_conversion_path(
        &self,
        source_hash: &str,
        source_extension: &str,
    ) -> Result<PathBuf> {
        validate_hash(source_hash)?;
        let source_extension = normalize_extension(source_extension);
        if !matches!(source_extension.as_str(), "docx" | "xlsx" | "pptx") {
            return Err(StorageError::InvalidDocumentConversion(
                "source extension must be docx, xlsx, or pptx".to_string(),
            ));
        }
        let prefix = source_hash.get(..2).ok_or(StorageError::InvalidHash)?;
        let config_root = self.objects_dir.parent().ok_or(StorageError::NoDataDir)?;
        Ok(config_root
            .join(DOCUMENT_CONVERSIONS_DIR)
            .join(prefix)
            .join(format!("{source_hash}.{source_extension}.json")))
    }

    pub fn load_document_conversion(
        &self,
        source_hash: &str,
        source_extension: &str,
    ) -> Result<Option<DocumentConversion>> {
        let path = self.document_conversion_path(source_hash, source_extension)?;
        if !path.exists() {
            return Ok(None);
        }
        let conversion = serde_json::from_slice::<DocumentConversion>(&fs::read(path)?)?;
        validate_hash(&conversion.source_hash)?;
        validate_hash(&conversion.pdf_hash)?;
        let expected_extension = normalize_extension(source_extension);
        if !conversion.source_hash.eq_ignore_ascii_case(source_hash)
            || conversion.source_extension != expected_extension
        {
            return Err(StorageError::InvalidDocumentConversion(
                "conversion receipt does not match its source identity".to_string(),
            ));
        }
        Ok(Some(conversion))
    }

    pub fn save_document_conversion(&self, conversion: &DocumentConversion) -> Result<()> {
        validate_hash(&conversion.source_hash)?;
        validate_hash(&conversion.pdf_hash)?;
        if conversion.recipe.trim().is_empty() {
            return Err(StorageError::InvalidDocumentConversion(
                "conversion recipe cannot be empty".to_string(),
            ));
        }
        let path =
            self.document_conversion_path(&conversion.source_hash, &conversion.source_extension)?;
        let parent = path
            .parent()
            .ok_or_else(|| StorageError::InvalidDocumentConversion("invalid path".to_string()))?;
        fs::create_dir_all(parent)?;
        atomic_write(&path, serde_json::to_vec_pretty(conversion)?.as_slice())
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
        let path = self.object_manifest_path(hash)?;
        reject_symlink_or_non_regular(&path)?;
        let json = fs::read_to_string(path)?;
        let manifest: ObjectManifest = serde_json::from_str(&json).map_err(|error| {
            StorageError::KeyStore(format!("malformed-object-manifest: {error}"))
        })?;
        manifest.validate().map_err(|error| {
            StorageError::KeyStore(format!("malformed-object-manifest: {error}"))
        })?;
        Ok(manifest)
    }

    pub fn save_object_manifest(&self, hash: &str, manifest: &ObjectManifest) -> Result<()> {
        manifest.validate().map_err(|error| {
            StorageError::KeyStore(format!("malformed-object-manifest: {error}"))
        })?;
        let path = self.object_manifest_path(hash)?;
        let parent = path.parent().ok_or(StorageError::InvalidHash)?;
        fs::create_dir_all(parent)?;
        atomic_write(&path, serde_json::to_string_pretty(manifest)?.as_bytes())
    }

    pub fn lock_object_manifest(&self, hash: &str) -> Result<ObjectManifestLock> {
        let object_dir = self.object_dir(hash)?;
        fs::create_dir_all(&object_dir)?;
        ensure_private_directory(&object_dir)?;
        let lock_path = object_dir.join(OBJECT_MANIFEST_LOCK_FILE);
        reject_symlink_or_non_regular(&lock_path)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&lock_path)?;
        set_private_file_permissions(&lock_path)?;
        file.lock_exclusive()?;
        Ok(ObjectManifestLock { file })
    }

    pub fn has_object_remotes(&self) -> Result<bool> {
        if !self.objects_dir.exists() {
            return Ok(false);
        }
        for prefix in fs::read_dir(&self.objects_dir)? {
            let prefix = prefix?.path();
            if !prefix.is_dir() {
                continue;
            }
            for object in fs::read_dir(prefix)? {
                let object = object?.path();
                let Some(hash) = object.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                if validate_hash(hash).is_err() {
                    continue;
                }
                let manifest_path = object.join(OBJECT_MANIFEST_FILE);
                if !manifest_path.exists() {
                    continue;
                }
                if !self.load_object_manifest(hash)?.object_remotes.is_empty() {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    pub fn reset_all_object_remotes(&self) -> Result<usize> {
        let mut reset = 0;
        if !self.objects_dir.exists() {
            return Ok(reset);
        }
        for prefix in fs::read_dir(&self.objects_dir)? {
            let prefix = prefix?.path();
            if !prefix.is_dir() {
                continue;
            }
            for object in fs::read_dir(prefix)? {
                let object = object?.path();
                let Some(hash) = object.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                if validate_hash(hash).is_err() || !object.join(OBJECT_MANIFEST_FILE).exists() {
                    continue;
                }
                let _lock = self.lock_object_manifest(hash)?;
                let mut manifest = self.load_object_manifest(hash)?;
                if manifest.object_remotes.is_empty() {
                    continue;
                }
                manifest.object_remotes.clear();
                self.save_object_manifest(hash, &manifest)?;
                reset += 1;
            }
        }
        Ok(reset)
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

    pub fn get_reverse_image_search_cache(
        &self,
        hash: &str,
    ) -> Result<Option<ReverseImageSearchCache>> {
        self.load_object_manifest(hash)
            .map(|manifest| manifest.reverse_image_search)
    }

    pub fn save_reverse_image_search_cache(
        &self,
        hash: &str,
        imgbb_url: String,
        google_lens_url: String,
    ) -> Result<()> {
        let _lock = self.lock_object_manifest(hash)?;
        let mut manifest = self.load_object_manifest(hash)?;
        manifest.reverse_image_search = Some(ReverseImageSearchCache {
            imgbb_url,
            google_lens_url,
            created_at: chrono::Utc::now(),
        });
        self.save_object_manifest(hash, &manifest)
    }
}
