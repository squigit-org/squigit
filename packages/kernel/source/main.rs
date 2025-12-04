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
use std::path::PathBuf;
use utilities::{audmgr, launcher};

fn main() -> Result<()> {
    let exe_path = std::env::current_exe()?;
    let bin_dir = exe_path.parent().unwrap();

    let engine_bin = if cfg!(windows) {
        "engine.exe"
    } else {
        "engine"
    };
    let engine_path = bin_dir.join(engine_bin);

    let temp_dir = std::env::temp_dir();
    let lock_path = temp_dir.join("spatialshot.lock");

    let lock_file = File::create(&lock_path).context("Failed to create lock file")?;

    if lock_file.try_lock_exclusive().is_err() {
        return Ok(());
    }

    let _audio_guard = audmgr::AudioGuard::new();

    let capture_result = launcher::run_engine(&engine_path);

    drop(lock_file);
    drop(_audio_guard);

    match capture_result {
        Ok(image_path) => {
            if image_path.exists() {
                launcher::spawn_electron(bin_dir, &image_path)?;
            }
        }
        Err(_) => {}
    }

    Ok(())
}
