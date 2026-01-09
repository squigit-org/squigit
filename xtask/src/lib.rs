// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Context, Result};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

// --- Capture Paths ---
pub fn capture_sidecar_dir() -> PathBuf {
    project_root().join("sidecars").join("qt-capture")
}

pub fn qt_native_dir() -> PathBuf {
    capture_sidecar_dir().join("native")
}

// --- OCR Paths ---
pub fn ocr_sidecar_dir() -> PathBuf {
    project_root().join("sidecars").join("paddle-ocr")
}

pub fn venv_python() -> PathBuf {
    let sidecar = ocr_sidecar_dir();
    if cfg!(windows) {
        sidecar.join("venv").join("Scripts").join("python.exe")
    } else {
        sidecar.join("venv").join("bin").join("python")
    }
}

// --- Tauri Paths ---
pub fn ui_dir() -> PathBuf {
    project_root().join("ui")
}

pub fn tauri_dir() -> PathBuf {
    project_root().join("app")
}

// --- Process Utils ---

pub fn run_cmd(cmd: &str, args: &[&str], cwd: &Path) -> Result<()> {
    println!("  $ {} {}", cmd, args.join(" "));
    let status = Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .status()
        .with_context(|| format!("Failed to run: {} {:?}", cmd, args))?;

    if !status.success() {
        anyhow::bail!("Command failed with exit code: {:?}", status.code());
    }
    Ok(())
}

pub fn run_cmd_with_node_bin(
    cmd: &str,
    args: &[&str],
    cwd: &Path,
    node_bin_dir: &Path,
) -> Result<()> {
    println!("  $ {} {}", cmd, args.join(" "));

    let path_var = env::var("PATH").unwrap_or_default();
    let new_path = format!("{}:{}", node_bin_dir.display(), path_var);

    let status = Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .env("PATH", new_path)
        .status()
        .with_context(|| format!("Failed to run: {} {:?}", cmd, args))?;

    if !status.success() {
        anyhow::bail!("Command failed with exit code: {:?}", status.code());
    }
    Ok(())
}

pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

pub fn get_host_target_triple() -> Result<String> {
    let output = Command::new("rustc").arg("-vV").output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.starts_with("host: ") {
            return Ok(line.trim_start_matches("host: ").trim().to_string());
        }
    }
    Ok("unknown-target".to_string())
}
