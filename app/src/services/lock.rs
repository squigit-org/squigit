// src/lib/lock.rs

use anyhow::{Context, Result};
use fs2::FileExt;
use once_cell::sync::Lazy;
use std::fs::File;
use std::sync::Mutex;

// Keep the file handle alive globally until unlocked or process exit
static GLOBAL_LOCK: Lazy<Mutex<Option<File>>> = Lazy::new(|| Mutex::new(None));

pub struct LockGuard;

impl LockGuard {
    /// Attempts to acquire the global lock. Returns a guard that unlocks on Drop.
    pub fn acquire() -> Result<Self> {
        try_lock()?;
        Ok(Self)
    }
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        unlock();
    }
}

fn try_lock() -> Result<()> {
    let lock_path = std::env::temp_dir().join("spatialshot.lock");
    
    // Open with write permissions to allow locking
    let file = File::options()
        .read(true)
        .write(true)
        .create(true)
        .open(&lock_path)
        .context("Failed to open lock file")?;

    // Try exclusive lock (non-blocking)
    file.try_lock_exclusive().context("Capture is already running")?;

    // Store the file handle to keep the lock alive
    let mut guard = GLOBAL_LOCK.lock().unwrap();
    *guard = Some(file);

    Ok(())
}

fn unlock() {
    let mut guard = GLOBAL_LOCK.lock().unwrap();
    if let Some(file) = guard.take() {
        let _ = file.unlock();
        // File is dropped here, closing the handle
    }
}