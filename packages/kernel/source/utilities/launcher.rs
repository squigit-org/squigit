/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use anyhow::{anyhow, Context, Result};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};

// Global atomic to store the Engine PID so Watchdog can kill it
pub static ENGINE_PID: AtomicU32 = AtomicU32::new(0);

pub fn run_engine(engine_path: &PathBuf) -> Result<PathBuf> {
    // 1. Prepare the output path based on OS Temp dir
    let temp_dir = std::env::temp_dir();
    let expected_image = temp_dir.join("spatial_capture.png");

    // 2. Spawn the Engine
    // Note: We pipe stdout (to read the path) but inherit stderr (so you see logs in terminal)
    let mut child = Command::new(engine_path)
        .stdout(Stdio::piped())
        .spawn()
        .context("Failed to spawn Engine process")?;

    // 3. Register PID for the Watchdog
    ENGINE_PID.store(child.id(), Ordering::SeqCst);

    // 4. Listen for the magic words
    let stdout = child.stdout.take().context("Failed to open stdout")?;
    let reader = BufReader::new(stdout);
    let mut capture_success = false;

    for line in reader.lines() {
        match line {
            Ok(content) => {
                // [DEBUG] Let's see what the Kernel actually hears
                println!("[Kernel-Log] Engine said: {}", content);

                // RELAXED CHECK: Just look for the filename
                if content.contains("spatial_capture.png") {
                    capture_success = true;
                    // If the content is just the path, we can verify it immediately
                    // But usually, we just wait for the engine to finish or break here.
                    break;
                }
            }
            Err(_) => break,
        }
    }

    // 5. Cleanup
    let _ = child.wait(); // Ensure he exits gracefully
    ENGINE_PID.store(0, Ordering::SeqCst); // Reset PID

    if capture_success {
        Ok(expected_image)
    } else {
        Err(anyhow!("Engine exited without confirming capture"))
    }
}

pub fn spawn_electron(bin_dir: &Path, image_path: &PathBuf) -> Result<()> {
    let electron_executable = if cfg!(target_os = "windows") {
        bin_dir.parent().unwrap().join("App").join("spatialshot.exe")
    } else if cfg!(target_os = "macos") {
        bin_dir
            .parent()
            .unwrap()
            .join("Resources")
            .join("App")
            .join("spatialshot")
    } else {
        bin_dir.join("App").join("spatialshot")
    };

    println!("[Kernel-Log] Launching Electron at: {:?}", electron_executable);

    Command::new(electron_executable)
        .arg(image_path)
        .arg("--no-sandbox")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Failed to launch Electron UI")?;

    Ok(())
}