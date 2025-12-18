/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use crate::utilities::{audmgr, launcher, watchdog};
use anyhow::{Context, Result};
use fs2::FileExt;
use std::fs::File;

pub fn run() -> Result<()> {
    let exe_path = std::env::current_exe()?;
    let bin_dir = exe_path.parent().unwrap();

    let capture_dir_name = if cfg!(target_os = "linux") { "capture" } else { "Capture" };
    let capture_bin_name = if cfg!(windows) { "capture.exe" } else { "capture" };
    
    let capture_path = if cfg!(target_os = "macos") {
         bin_dir.parent().unwrap().join("Resources").join("Capture").join("capture")
    } else {
         bin_dir.join(capture_dir_name).join(capture_bin_name)
    };
    
    if !capture_path.exists() {
        return Err(anyhow::anyhow!("Capture binary not found at {:?}", capture_path));
    }

    let temp_dir = std::env::temp_dir();

    let user_suffix = std::env::var("USER") // Unix
        .or_else(|_| std::env::var("USERNAME")) // Windows
        .unwrap_or_else(|_| "uid".to_string());
        
    let lock_filename = format!("spatialshot_daemon_{}.lock", user_suffix);
    let lock_path = temp_dir.join(lock_filename); 
    
    let lock_file = File::create(&lock_path).context("Failed to create lock file")?;
    if lock_file.try_lock_exclusive().is_err() {
        log::warn!("Capture busy. Ignoring.");
        return Ok(());
    }

    watchdog::start_monitor();

    let _audio_guard = audmgr::AudioGuard::new();

    let capture_result = launcher::run_capture(&capture_path);

    drop(lock_file);
    drop(_audio_guard);

    match capture_result {
        Ok(image_path) => {
            if image_path.exists() {
                launcher::spawn_electron(bin_dir, &image_path)?;
            } else {
                return Err(anyhow::anyhow!("Capture reported success but file is missing: {:?}", image_path));
            }
        }
        Err(e) => {
            log::error!("Capture failed: {}", e);
            return Err(e);
        }
    }

    Ok(())
}
