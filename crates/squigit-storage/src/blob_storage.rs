// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::{Result, StorageError};
use crate::threads::ThreadStorage;

pub struct StoredBlob {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Copy)]
enum BlobKind {
    Image,
    Text,
}

impl BlobKind {
    fn directory(self) -> &'static str {
        match self {
            Self::Image => "images",
            Self::Text => "text",
        }
    }
}

fn invalid_blob(message: &str) -> StorageError {
    StorageError::InvalidBlob(message.to_string())
}

fn normalized_extension(extension: &str) -> Result<String> {
    let extension = extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    if extension.is_empty() || !extension.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return Err(invalid_blob("Invalid blob extension"));
    }
    Ok(extension)
}

fn validate_blob_name(name: &str) -> Result<()> {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| uuid::Uuid::parse_str(value).is_ok())
        .ok_or_else(|| invalid_blob("Blob names must be UUIDs"))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| invalid_blob("Blobs need an extension"))?;
    if normalized_extension(extension)? != extension || name != format!("{stem}.{extension}") {
        return Err(invalid_blob("Invalid blob name"));
    }
    Ok(())
}

impl ThreadStorage {
    pub fn blob_storage_dir(&self) -> Result<PathBuf> {
        Ok(self.base_dir().join("blob_storage"))
    }

    pub fn media_cache_dir(&self, source_hash: &str) -> Result<PathBuf> {
        self.object_dir(source_hash)?;
        let path = self.blob_storage_dir()?.join("media").join(source_hash);
        fs::create_dir_all(&path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for directory in [
                self.blob_storage_dir()?,
                self.blob_storage_dir()?.join("media"),
                path.clone(),
            ] {
                fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
            }
        }
        Ok(path)
    }

    fn blob_directory(&self, kind: BlobKind) -> Result<PathBuf> {
        Ok(self.blob_storage_dir()?.join(kind.directory()))
    }

    fn blob_path(&self, kind: BlobKind, name: &str) -> Result<PathBuf> {
        validate_blob_name(name)?;
        Ok(self.blob_directory(kind)?.join(name))
    }

    fn blob_name(&self, kind: BlobKind, path: &Path) -> Option<String> {
        let directory = self.blob_directory(kind).ok()?;
        let name = path.file_name()?.to_str()?;
        (path.parent() == Some(directory.as_path()) && validate_blob_name(name).is_ok())
            .then(|| name.to_string())
    }

    pub fn image_blob_path(&self, name: &str) -> Result<PathBuf> {
        self.blob_path(BlobKind::Image, name)
    }

    pub fn image_blob_name(&self, path: &Path) -> Option<String> {
        self.blob_name(BlobKind::Image, path)
    }

    pub fn new_text_blob_path(&self, extension: &str) -> Result<PathBuf> {
        let extension = normalized_extension(extension)?;
        let id = uuid::Uuid::new_v4();
        self.blob_path(BlobKind::Text, &format!("{id}.{extension}"))
    }

    pub fn store_text_blob(&self, path: &Path, content: &str) -> Result<StoredBlob> {
        let name = self.blob_name(BlobKind::Text, path).ok_or_else(|| {
            invalid_blob("Text blobs must be UUID files inside blob_storage/text")
        })?;
        self.write_blob(BlobKind::Text, &name, content.as_bytes())
    }

    pub fn store_image_blob(&self, bytes: &[u8], extension: &str) -> Result<StoredBlob> {
        let extension = normalized_extension(extension)?;
        let name = format!("{}.{extension}", uuid::Uuid::new_v4());
        self.write_blob(BlobKind::Image, &name, bytes)
    }

    fn write_blob(&self, kind: BlobKind, name: &str, bytes: &[u8]) -> Result<StoredBlob> {
        let path = self.blob_path(kind, name)?;
        let directory = self.blob_directory(kind)?;
        fs::create_dir_all(&directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for directory in [self.blob_storage_dir()?, directory] {
                fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
            }
        }
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        Ok(StoredBlob {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
        })
    }
}
