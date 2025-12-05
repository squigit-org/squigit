/**
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

    let engine_bin = if cfg!(windows) { "engine.exe" } else { "engine" };
    let engine_path = bin_dir.join("Engine").join(engine_bin);
    
    if !engine_path.exists() {
        return Err(anyhow::anyhow!("Engine binary not found at {:?}", engine_path));
    }

    let user_suffix = std::env::var("USER") // Unix
        .or_else(|_| std::env::var("USERNAME")) // Windows
        .unwrap_or_else(|_| "uid".to_string());
        
    let lock_filename = format!("spatialshot_kernel_{}.lock", user_suffix);
    let lock_path = temp_dir.join(lock_filename); 
    
    let lock_file = File::create(&lock_path).context("Failed to create lock file")?;
    if lock_file.try_lock_exclusive().is_err() {
        log::warn!("Capture busy. Ignoring.");
        return Ok(());
    }

    watchdog::start_monitor();

    let _audio_guard = audmgr::AudioGuard::new();

    let capture_result = launcher::run_engine(&engine_path);

    drop(lock_file);
    drop(_audio_guard);

    match capture_result {
        Ok(image_path) => {
            if image_path.exists() {
                launcher::spawn_electron(bin_dir, &image_path)?;
            } else {
                return Err(anyhow::anyhow!("Engine reported success but file is missing: {:?}", image_path));
            }
        }
        Err(e) => {
            log::error!("Engine failed: {}", e);
            return Err(e);
        }
    }

    Ok(())
}
