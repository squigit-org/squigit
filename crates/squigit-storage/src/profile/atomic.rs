// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::error::{ProfileError, Result};

use super::ProfileStore;

impl ProfileStore {
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
            ProfileError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Path has no parent: {}", path.display()),
            ))
        })?;
        fs::create_dir_all(parent)?;

        let temp_path = self.temp_path_for(path);
        {
            let mut temp_file = File::create(&temp_path)?;
            temp_file.write_all(bytes)?;
            temp_file.sync_all()?;
        }

        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(path)?;
        }

        fs::rename(&temp_path, path)?;
        Ok(())
    }
}
