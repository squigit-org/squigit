use anyhow::{Context, Result};
use std::fs;
use xtask::{project_root, run_cmd, run_cmd_with_node_bin, copy_dir_all};
use xtask::{capture_sidecar_dir, qt_native_dir};
use xtask::{ocr_sidecar_dir, venv_python};
use xtask::{ui_dir, tauri_dir};

use crate::commands::pkg;

pub fn all() -> Result<()> {
    ocr()?;
    capture()?;
    app()?;
    Ok(())
}

pub fn capture() -> Result<()> {
   println!("\nBuilding Capture Engine...");
    // 1. Build Qt
    build_qt_native()?;
    // 2. Deploy Qt
    println!("\nDeploying Qt runtime...");
    deploy_qt_native()?;
    // 3. Sign (macOS only)
    #[cfg(target_os = "macos")]
    {
        println!("\nSigning macOS bundle...");
        crate::platforms::macos::sign(&qt_native_dir())?;
    }
    // 4. Build Rust Wrapper
    build_capture_rust_wrapper()?;
    // 5. Package
    pkg::capture()?;
    println!("\nCapture Engine build complete!");
    Ok(())
}

pub fn capture_qt_only() -> Result<()> {
    println!("\nBuilding Qt native binary (CMake only)...");
    build_qt_native()?;
    println!("\nQt build complete!");
    Ok(())
}

fn build_qt_native() -> Result<()> {
     println!("\nRunning Qt CMake build...");
    let native_dir = qt_native_dir();
    #[cfg(target_os = "linux")]
    crate::platforms::linux::build(&native_dir)?;
    #[cfg(target_os = "macos")]
    crate::platforms::macos::build(&native_dir)?;
    #[cfg(target_os = "windows")]
    crate::platforms::win::build(&native_dir)?;
    Ok(())
}

fn deploy_qt_native() -> Result<()> {
    let native_dir = qt_native_dir();
    #[cfg(target_os = "linux")]
    crate::platforms::linux::deploy(&native_dir)?;
    #[cfg(target_os = "macos")]
    crate::platforms::macos::deploy(&native_dir)?;
    #[cfg(target_os = "windows")]
    crate::platforms::win::deploy(&native_dir)?;
    Ok(())
}

fn build_capture_rust_wrapper() -> Result<()> {
    println!("\nBuilding Rust wrapper...");
    let _sidecar = capture_sidecar_dir(); 
    run_cmd(
        "cargo",
        &["build", "--release", "-p", "capture-engine"],
        &project_root(),
    )?;
    Ok(())
}

pub fn ocr() -> Result<()> {
    println!("\nBuilding PaddleOCR sidecar...");
    let sidecar = ocr_sidecar_dir();
    let venv = sidecar.join("venv");
    if !venv.exists() {
        println!("\nCreating virtual environment...");
        run_cmd("python3", &["-m", "venv", "venv"], &sidecar)?;
    }
    println!("\nInstalling dependencies...");
     let pip = if cfg!(windows) {
        venv.join("Scripts").join("pip.exe")
    } else {
        venv.join("bin").join("pip")
    };
    run_cmd(pip.to_str().unwrap(), &["install", "-r", "requirements.txt"], &sidecar)?;

    // Patches
    println!("\nApplying patches...");
    let python = venv_python();
    let py = python.to_str().unwrap();
    run_cmd(py, &["patches/paddleocr.py"], &sidecar)?;
    run_cmd(py, &["patches/paddle_core.py"], &sidecar)?;
    run_cmd(py, &["patches/cpp_extension.py"], &sidecar)?;
    run_cmd(py, &["patches/iaa_augment.py"], &sidecar)?;

    // Models
    println!("\nDownloading models...");
    run_cmd(py, &["download_models.py"], &sidecar)?;

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

    // PyInstaller
    println!("\nBuilding executable...");
    let pyinstaller = if cfg!(windows) {
        venv.join("Scripts").join("pyinstaller.exe")
    } else {
        venv.join("bin").join("pyinstaller")
    };
    run_cmd(pyinstaller.to_str().unwrap(), &["--clean", "ocr-engine.spec"], &sidecar)?;

    // Package
    pkg::ocr()?;
    println!("\nSidecar build complete!");
    Ok(())
}

pub fn app() -> Result<()> {
    println!("\nBuilding Tauri app...");
    let ui = ui_dir();
    let app = tauri_dir();
    let node_bin = ui.join("node_modules").join(".bin");
    if !ui.join("node_modules").exists() {
        println!("\nInstalling npm dependencies...");
        run_cmd("npm", &["install"], &ui)?;
    }
    run_cmd_with_node_bin("tauri", &["build"], &app, &node_bin)?;
    println!("\nApp build complete!");
    Ok(())
}
