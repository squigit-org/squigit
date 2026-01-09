use anyhow::Result;
use std::fs;
use xtask::{project_root, get_host_target_triple, copy_dir_all, qt_native_dir, ocr_sidecar_dir};

pub fn capture() -> Result<()> {
    println!("\nPackaging Capture Engine artifacts for Tauri...");

    let target_dir = project_root().join("target").join("release");
    let qt_runtime_src = qt_native_dir().join("qt-runtime");
    
    // Tauri app structure
    let app_binaries = project_root().join("app").join("binaries");
    fs::create_dir_all(&app_binaries)?;

    // 1. Move qt-runtime to app/binaries/qt-runtime
    let qt_runtime_dst = app_binaries.join("qt-runtime");
    if qt_runtime_dst.exists() {
        fs::remove_dir_all(&qt_runtime_dst)?;
    }
    
    if !qt_runtime_src.exists() {
        anyhow::bail!("Qt runtime not found at {}", qt_runtime_src.display());
    }

    println!("  Moving qt-runtime to {}", qt_runtime_dst.display());
    // Try rename first (atomic move), fall back to copy+delete
    if fs::rename(&qt_runtime_src, &qt_runtime_dst).is_err() {
        copy_dir_all(&qt_runtime_src, &qt_runtime_dst)?;
        fs::remove_dir_all(&qt_runtime_src)?;
    }

    // 2. Copy and rename Rust binary
    let src_binary_name = format!("capture-engine{}", if cfg!(windows) { ".exe" } else { "" });
    let src_binary_path = target_dir.join(&src_binary_name);

    if !src_binary_path.exists() {
        anyhow::bail!("Rust binary not found: {}", src_binary_path.display());
    }

    let host_triple = get_host_target_triple()?;
    
    let dst_binary_name = format!("capture-engine-{}{}", host_triple, if cfg!(windows) { ".exe" } else { "" });
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

    // Copy and rename Binary
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
