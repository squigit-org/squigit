// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use std::fs;
use xtask::{
    copy_dir_all, get_host_target_triple, ocr_sidecar_dir, project_root, qt_native_dir,
    whisper_sidecar_dir,
};

pub fn capture() -> Result<()> {
    println!("\nPackaging Capture Engine artifacts for Tauri...");

    let target_dir = project_root().join("target").join("release");
    let qt_runtime_src = qt_native_dir().join("qt-runtime");

    let app_binaries = project_root().join("app").join("binaries");
    fs::create_dir_all(&app_binaries)?;

    let qt_runtime_dst = app_binaries.join("qt-runtime");
    if qt_runtime_dst.exists() {
        fs::remove_dir_all(&qt_runtime_dst)?;
    }

    if !qt_runtime_src.exists() {
        anyhow::bail!("Qt runtime not found at {}", qt_runtime_src.display());
    }

    println!("  Moving qt-runtime to {}", qt_runtime_dst.display());
    if fs::rename(&qt_runtime_src, &qt_runtime_dst).is_err() {
        copy_dir_all(&qt_runtime_src, &qt_runtime_dst)?;
        fs::remove_dir_all(&qt_runtime_src)?;
    }

    let src_binary_name = format!("capture-engine{}", if cfg!(windows) { ".exe" } else { "" });
    let src_binary_path = target_dir.join(&src_binary_name);

    if !src_binary_path.exists() {
        anyhow::bail!("Rust binary not found: {}", src_binary_path.display());
    }

    let host_triple = get_host_target_triple()?;

    let dst_binary_name = format!(
        "capture-engine-{}{}",
        host_triple,
        if cfg!(windows) { ".exe" } else { "" }
    );
    let dst_binary_path = app_binaries.join(&dst_binary_name);

    println!("  Copying binary to {}", dst_binary_path.display());
    fs::copy(&src_binary_path, &dst_binary_path)?;

    Ok(())
}

pub fn ocr() -> Result<()> {
    println!("\nPackaging OCR sidecar artifacts for Tauri...");

    let sidecar = ocr_sidecar_dir();
    let dist_dir = sidecar.join("dist");
    let app_binaries = project_root().join("app").join("binaries");

    fs::create_dir_all(&app_binaries)?;

    let src_binary_name = format!("ocr-engine{}", if cfg!(windows) { ".exe" } else { "" });
    let src_binary_path = dist_dir.join(&src_binary_name);

    if !src_binary_path.exists() {
        anyhow::bail!("OCR binary not found: {}", src_binary_path.display());
    }

    let host_triple = get_host_target_triple()?;

    let dst_binary_name = format!(
        "ocr-engine-{}{}",
        host_triple,
        if cfg!(windows) { ".exe" } else { "" }
    );
    let dst_binary_path = app_binaries.join(&dst_binary_name);

    println!("  Copying binary to {}", dst_binary_path.display());
    fs::copy(&src_binary_path, &dst_binary_path)?;

    Ok(())
}

pub fn whisper() -> Result<()> {
    println!("\nPackaging Whisper STT sidecar artifacts for Tauri...");

    let sidecar = whisper_sidecar_dir();
    let build_dir = sidecar.join("build");
    let app_binaries = project_root().join("app").join("binaries");

    fs::create_dir_all(&app_binaries)?;

    let binary_name = if cfg!(windows) { "whisper-stt.exe" } else { "whisper-stt" };
    // On Windows/Release, CMake might put it in Release/ folder
    let src_binary_path = if cfg!(windows) {
        build_dir.join("Release").join(binary_name)
    } else {
        build_dir.join(binary_name)
    };

    if !src_binary_path.exists() {
        // Fallback check directly in build dir for non-multiconfig generators
        let fallback = build_dir.join(binary_name);
        if !fallback.exists() {
             anyhow::bail!("Whisper binary not found at {}", src_binary_path.display());
        }
    }

    // Use the one that exists
    let final_src = if src_binary_path.exists() { src_binary_path } else { build_dir.join(binary_name) };

    let host_triple = get_host_target_triple()?;
    let dst_binary_name = format!(
        "whisper-stt-{}{}",
        host_triple,
        if cfg!(windows) { ".exe" } else { "" }
    );
    let dst_binary_path = app_binaries.join(&dst_binary_name);

    println!("  Copying binary to {}", dst_binary_path.display());
    fs::copy(&final_src, &dst_binary_path)?;

    Ok(())
}
