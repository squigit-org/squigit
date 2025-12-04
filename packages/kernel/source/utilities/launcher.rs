/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn run_engine(binary_path: &Path) -> Result<PathBuf> {
    if !binary_path.exists() {
        return Err(anyhow!("Engine binary not found at {:?}", binary_path));
    }

    let output = Command::new(binary_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()?;

    if !output.status.success() {
        return Err(anyhow!("Engine exited with non-zero status"));
    }

    let raw_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let path = PathBuf::from(raw_path);

    Ok(path)
}

pub fn spawn_electron(bin_dir: &Path, image_path: &Path) -> Result<()> {
    let electron_bin = if cfg!(windows) {
        "spatialshot.exe"
    } else {
        "spatialshot"
    };
    let electron_path = bin_dir.join(electron_bin);

    Command::new(electron_path)
        .arg("--process-image")
        .arg(image_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Failed to launch SpatialShot Electron app")?;

    Ok(())
}
