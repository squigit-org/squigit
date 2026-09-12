// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::error::{Result, StorageError};

use super::ProfileStore;

impl ProfileStore {
    pub(super) fn reject_symlink(path: &Path) -> Result<()> {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.file_type().is_symlink() => Err(StorageError::KeyStore(
                format!("refusing symbolic-link target: {}", path.display()),
            )),
            Ok(metadata) if !metadata.is_file() => Err(StorageError::KeyStore(format!(
                "refusing non-regular file target: {}",
                path.display()
            ))),
            Ok(_) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub(super) fn ensure_private_directory(path: &Path) -> Result<()> {
        let metadata = fs::symlink_metadata(path)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(StorageError::KeyStore(format!(
                "refusing non-directory storage path: {}",
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

    pub(super) fn set_private_file_permissions(path: &Path) -> Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    }

    fn temp_path_for(&self, path: &Path) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("temp");
        path.with_file_name(format!(
            ".{}.tmp-{}-{}",
            file_name,
            std::process::id(),
            suffix
        ))
    }

    pub(crate) fn write_json_atomic<T: Serialize>(&self, path: &Path, value: &T) -> Result<()> {
        let json = serde_json::to_vec_pretty(value)?;
        self.write_bytes_atomic(path, &json)
    }

    pub(crate) fn write_bytes_atomic(&self, path: &Path, bytes: &[u8]) -> Result<()> {
        let parent = path.parent().ok_or_else(|| {
            StorageError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Path has no parent: {}", path.display()),
            ))
        })?;
        fs::create_dir_all(parent)?;
        Self::ensure_private_directory(parent)?;
        Self::reject_symlink(path)?;

        let temp_path = self.temp_path_for(path);
        let write_result = (|| -> Result<()> {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut temp_file = options.open(&temp_path)?;
            temp_file.write_all(bytes)?;
            temp_file.sync_all()?;
            drop(temp_file);

            crate::secure_file::replace_file(&temp_path, path)?;
            Self::set_private_file_permissions(path)?;
            crate::secure_file::sync_parent(parent)?;
            Ok(())
        })();

        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        write_result
    }
}
