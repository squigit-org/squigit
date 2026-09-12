// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Shared persisted release metadata for Squigit shells.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};

use crate::error::{Result, StorageError};

pub const VERSION_FILE_NAME: &str = "version.json";
const VERSION_LOCK_FILE_NAME: &str = "version.lock";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VersionType {
    Calver,
    Semver,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ProductVersion {
    pub current_version: Option<String>,
    pub latest_version: String,
    pub version_type: VersionType,
    pub released_at: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct VersionFile {
    pub app: ProductVersion,
    pub cli: ProductVersion,
    pub ocr: ProductVersion,
    pub last_fetch_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct VersionStore {
    base_dir: PathBuf,
    version_path: PathBuf,
    lock_path: PathBuf,
}

impl VersionStore {
    pub fn new() -> Result<Self> {
        let base_dir = crate::paths::base_config_dir().ok_or(StorageError::NoConfigDir)?;
        Self::with_base_dir(base_dir)
    }

    pub fn with_base_dir(base_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&base_dir)?;
        Ok(Self {
            version_path: base_dir.join(VERSION_FILE_NAME),
            lock_path: base_dir.join(VERSION_LOCK_FILE_NAME),
            base_dir,
        })
    }

    pub fn load(&self) -> Result<Option<VersionFile>> {
        load_version_file(&self.version_path)
    }

    pub fn lock(&self) -> Result<VersionStoreGuard> {
        fs::create_dir_all(&self.base_dir)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock_file = options.open(&self.lock_path)?;
        lock_file.lock_exclusive()?;
        Ok(VersionStoreGuard {
            version_path: self.version_path.clone(),
            lock_file,
        })
    }
}

pub struct VersionStoreGuard {
    version_path: PathBuf,
    lock_file: File,
}

impl VersionStoreGuard {
    pub fn load(&self) -> Result<Option<VersionFile>> {
        load_version_file(&self.version_path)
    }

    pub fn save(&self, value: &VersionFile) -> Result<()> {
        let mut json = serde_json::to_vec(value)?;
        json.push(b'\n');
        atomic_write(&self.version_path, &json)
    }
}

impl Drop for VersionStoreGuard {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.lock_file);
    }
}

fn load_version_file(path: &Path) -> Result<Option<VersionFile>> {
    let contents = match fs::read(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_slice(&contents)
        .map(Some)
        .map_err(Into::into)
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or_else(|| {
        StorageError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("Path has no parent: {}", path.display()),
        ))
    })?;
    fs::create_dir_all(parent)?;

    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(StorageError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Refusing non-regular version file: {}", path.display()),
            )));
        }
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("version.json");
    let temporary = path.with_file_name(format!(".{file_name}.tmp-{}", uuid::Uuid::new_v4()));

    let write_result = (|| -> Result<()> {
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
        crate::secure_file::sync_parent(parent)?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}
