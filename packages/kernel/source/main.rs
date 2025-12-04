#![windows_subsystem = "windows"]

/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */
mod utilities;

use anyhow::{Context, Result};
use fs2::FileExt;
use std::fs::File;
use utilities::{audmgr, launcher, watchdog};

fn main() -> Result<()> {
    let exe_path = std::env::current_exe()?;
    let bin_dir = exe_path.parent().unwrap();

    // 1. Locate Engine Binary
    let engine_bin = if cfg!(windows) {
        "engine.exe"
    } else {
        "engine"
    };

    // Based on Blueprint 1 & 3: Kernel and Engine share the same folder in Install Dir
    // (Except macOS where structure is deeper, but typically in `MacOS/` both live together)
    let engine_path = bin_dir.join("Engine").join(engine_bin);
    // Correction based on Blueprint 1:
    // Windows: kernel.exe is in root, Engine is in Engine/.
    // Linux: kernel is in root, Engine in Engine/.
    // Let's ensure we look in 'Engine' folder relative to kernel.

    // 2. Lock Instance (Single Kernel Rule)
    let temp_dir = std::env::temp_dir();
    let lock_path = temp_dir.join("spatialshot.lock");

    let lock_file = File::create(&lock_path).context("Failed to create lock file")?;
    if lock_file.try_lock_exclusive().is_err() {
        // Another instance is running, silent exit
        return Ok(());
    }

    // 3. Start Watchdog (Monitor Display Changes)
    watchdog::start_monitor();

    // 4. Mute Audio (AudioGuard)
    // The guard will unmute when it goes out of scope (end of main)
    let _audio_guard = audmgr::AudioGuard::new();

    // 5. Run Engine and Wait for "The Output"
    let capture_result = launcher::run_engine(&engine_path);

    // 6. Release resources
    drop(lock_file);
    drop(_audio_guard); // Unmute immediately after capture is done/failed

    // 7. Process Result
    match capture_result {
        Ok(image_path) => {
            if image_path.exists() {
                // Pass the baton to Electron
                launcher::spawn_electron(bin_dir, &image_path)?;
                // Mission Complete: Kill self
                std::process::exit(0);
            }
        }
        Err(e) => {
            eprintln!("Capture failed: {}", e);
            // Exit with error
            std::process::exit(1);
        }
    }

    Ok(())
}
