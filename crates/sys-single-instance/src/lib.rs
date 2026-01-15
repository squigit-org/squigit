// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Single instance lock for preventing multiple capture overlays
//! Creates a .lock file to ensure only one capture session runs at a time.
//! This prevents double freezes and multiple overlays.

use anyhow::{anyhow, Context, Result};
use fs2::FileExt;
use std::fs::{self, File};
use std::path::PathBuf;

pub struct InstanceLock {
    file: File,
    path: PathBuf,
}

impl InstanceLock {
    pub fn try_acquire(app_name: &str) -> Result<Self> {
        let dir = Self::lock_dir()?;
        fs::create_dir_all(&dir)?;

        let path = dir.join(format!("{}.lock", app_name));

        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .with_context(|| format!("Failed to open lock file: {:?}", path))?;

        file.try_lock_exclusive()
            .map_err(|_| anyhow!("Another instance is already running (lock: {:?})", path))?;

        Ok(Self { file, path })
    }

    pub fn force_release(app_name: &str) -> Result<()> {
        let dir = Self::lock_dir()?;
        let path = dir.join(format!("{}.lock", app_name));

        if path.exists() {
            fs::remove_file(&path)
                .with_context(|| format!("Failed to remove stale lock: {:?}", path))?;
        }
        Ok(())
    }

    fn lock_dir() -> Result<PathBuf> {
        dirs::runtime_dir()
            .or_else(dirs::cache_dir)
            .context("Failed to resolve lock directory (no XDG_RUNTIME_DIR or cache dir)")
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
        let _ = fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_acquire_and_release() {
        let app_name = "test-single-instance-123";

        let lock = InstanceLock::try_acquire(app_name);
        assert!(lock.is_ok(), "First lock should succeed");

        let lock2 = InstanceLock::try_acquire(app_name);
        assert!(lock2.is_err(), "Second lock should fail");

        drop(lock);

        let lock3 = InstanceLock::try_acquire(app_name);
        assert!(lock3.is_ok(), "Lock after release should succeed");
    }

    #[test]
    fn test_force_release() {
        let app_name = "test-force-release-456";
        let _lock = InstanceLock::try_acquire(app_name).unwrap();

        let result = InstanceLock::force_release(app_name);
        assert!(result.is_ok());
    }
}
