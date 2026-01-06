// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! PaddleOCR sidecar build automation.
//!
//! Handles building the Python-based OCR engine as a standalone
//! executable using PyInstaller.

use anyhow::{Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::utils::{project_root, run_cmd, copy_dir_all, target_triple};

/// Get the sidecar directory path.
pub fn sidecar_dir() -> std::path::PathBuf {
    project_root().join("sidecars").join("paddle-ocr")
}

/// Get the Tauri app directory path.
fn tauri_dir() -> std::path::PathBuf {
    project_root().join("app")
}

/// Get the venv Python executable path.
fn venv_python() -> std::path::PathBuf {
    let sidecar = sidecar_dir();
    if cfg!(windows) {
        sidecar.join("venv").join("Scripts").join("python.exe")
    } else {
        sidecar.join("venv").join("bin").join("python")
    }
}

/// Build the PaddleOCR sidecar executable.
pub fn build() -> Result<()> {
    println!("\n🔨 Building PaddleOCR sidecar...");
    
    let sidecar = sidecar_dir();
    let venv = sidecar.join("venv");
    
    // Step 1: Create venv if needed
    if !venv.exists() {
        println!("\n📦 Creating virtual environment...");
        run_cmd("python3", &["-m", "venv", "venv"], &sidecar)?;
    }
    
    // Step 2: Install dependencies
    println!("\n📥 Installing dependencies...");
    let pip = if cfg!(windows) {
        venv.join("Scripts").join("pip.exe")
    } else {
        venv.join("bin").join("pip")
    };
    run_cmd(
        pip.to_str().unwrap(),
        &["install", "-r", "requirements.txt"],
        &sidecar,
    )?;
    
    // Step 3: Apply patches
    println!("\n🔧 Applying patches...");
    let python = venv_python();
    let py = python.to_str().unwrap();
    
    run_cmd(py, &["patches/paddleocr.py"], &sidecar)?;
    run_cmd(py, &["patches/paddle_core.py"], &sidecar)?;
    run_cmd(py, &["patches/cpp_extension.py"], &sidecar)?;
    run_cmd(py, &["patches/iaa_augment.py"], &sidecar)?;
    
    // Step 4: Download models
    println!("\n📥 Downloading models...");
    run_cmd(py, &["download_models.py"], &sidecar)?;
    
    // Copy models to sidecar/models
    let home = dirs::home_dir().context("Could not find home directory")?;
    let cache = home.join(".paddleocr").join("whl");
    let models_dir = sidecar.join("models");
    
    fs::create_dir_all(&models_dir)?;
    
    let model_mappings = [
        ("det/en/en_PP-OCRv3_det_infer", "en_PP-OCRv3_det"),
        ("rec/en/en_PP-OCRv4_rec_infer", "en_PP-OCRv4_rec"),
        ("cls/ch_ppocr_mobile_v2.0_cls_infer", "ch_ppocr_mobile_v2.0_cls"),
    ];
    
    for (src_rel, dst_name) in model_mappings {
        let src = cache.join(src_rel);
        let dst = models_dir.join(dst_name);
        if src.exists() {
            if dst.exists() {
                fs::remove_dir_all(&dst)?;
            }
            copy_dir_all(&src, &dst)?;
            println!("  Copied {} -> {}", src_rel, dst_name);
        }
    }
    
    // Step 5: Build with PyInstaller
    println!("\n🔨 Building executable...");
    let pyinstaller = if cfg!(windows) {
        venv.join("Scripts").join("pyinstaller.exe")
    } else {
        venv.join("bin").join("pyinstaller")
    };
    run_cmd(
        pyinstaller.to_str().unwrap(),
        &["--clean", "ocr-engine.spec"],
        &sidecar,
    )?;
    
    // Step 6: Copy to Tauri binaries
    println!("\n📋 Copying to Tauri binaries...");
    let binary_name = format!("ocr-engine-{}", target_triple());
    let src_exe = sidecar.join("dist").join("ocr-engine");
    let tauri_binaries = tauri_dir().join("binaries");
    
    fs::create_dir_all(&tauri_binaries)?;
    
    let dst_exe = tauri_binaries.join(&binary_name);
    fs::copy(&src_exe, &dst_exe)?;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dst_exe, fs::Permissions::from_mode(0o755))?;
    }
    
    let size_mb = fs::metadata(&dst_exe)?.len() as f64 / (1024.0 * 1024.0);
    println!("  ✓ Built: {} ({:.1} MB)", dst_exe.display(), size_mb);
    
    // Step 7: Test
    println!("\n🧪 Testing executable...");
    let test_image = project_root().join("test_sample.png");
    if test_image.exists() {
        let output = Command::new(&dst_exe)
            .arg(&test_image)
            .output()?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("Hello OCR World!") {
            println!("  ✓ Test passed!");
        } else {
            println!("  ⚠ Test output: {}", stdout);
        }
    }
    
    println!("\n✅ Sidecar build complete!");
    Ok(())
}

/// Clean sidecar build artifacts.
pub fn clean() -> Result<()> {
    println!("\n🧹 Cleaning sidecar artifacts...");
    
    let sidecar = sidecar_dir();
    
    for dir in ["venv", "build", "dist", "models"] {
        let path = sidecar.join(dir);
        if path.exists() {
            println!("  Removing {}", path.display());
            fs::remove_dir_all(&path)?;
        }
    }
    
    Ok(())
}
