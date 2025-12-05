/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use crate::utilities::{audmgr, launcher, watchdog};
use anyhow::{Context, Result};
use fs2::FileExt;
use log;
use std::fs::File;

/// This function contains the core logic of the Spatialshot kernel.
pub fn run() -> Result<()> {
    let exe_path = std::env::current_exe()?;
    let bin_dir = exe_path.parent().unwrap();

    // 1. Locate Engine Binary
    let engine_bin = if cfg!(windows) {
        "engine.exe"
    } else {
        "engine"
    };
    let engine_path = bin_dir.join("Engine").join(engine_bin);

    // 2. Lock Instance (Single Kernel Rule)
    let temp_dir = std::env::temp_dir();
    let lock_path = temp_dir.join("spatialshot.lock");

    let lock_file = File::create(&lock_path).context("Failed to create lock file")?;
    if lock_file.try_lock_exclusive().is_err() {
        // Another instance is running, silent exit
        log::warn!("Capture is already in progress. Ignoring new request.");
        return Ok(());
    }

    // 3. Start Watchdog (Monitor Display Changes)
    watchdog::start_monitor();

    // 4. Mute Audio (AudioGuard)
    let _audio_guard = audmgr::AudioGuard::new();

    // 5. Run Engine and Wait for "The Output"
    let capture_result = launcher::run_engine(&engine_path);

    // 6. Release resources (via drop)
    drop(lock_file);
    drop(_audio_guard); // Unmute immediately after capture is done/failed

    // 7. Process Result
    match capture_result {
        Ok(image_path) => {
            if image_path.exists() {
                // Pass the baton to Electron
                launcher::spawn_electron(bin_dir, &image_path)?;
            } else {
                return Err(anyhow::anyhow!("Engine ran but output file is missing."));
            }
        }
        Err(e) => {
            log::error!("Capture failed: {}", e);
            return Err(e); // Return error to the caller thread
        }
    }

    Ok(())
}
