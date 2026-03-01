// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use std::fs;
use xtask::{capture_sidecar_dir, qt_native_dir};
use xtask::{ocr_sidecar_dir, venv_python};
use xtask::{project_root, run_cmd, run_cmd_with_node_bin};
use xtask::{tauri_dir, ui_dir};

use crate::commands::pkg;

pub fn all() -> Result<()> {
    ocr()?;
    whisper()?;
    capture()?;
    app()?;
    Ok(())
}

pub fn capture() -> Result<()> {
    println!("\nBuilding Capture Engine...");
    build_qt_native()?;
    println!("\nDeploying Qt runtime...");
    deploy_qt_native()?;
    #[cfg(target_os = "macos")]
    {
        println!("\nSigning macOS bundle...");
        crate::platforms::macos::sign(&qt_native_dir())?;
    }
    build_capture_rust_wrapper()?;
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
        let mut created = false;

        for (cmd, args) in [
            ("python3", vec!["-m", "venv", "venv"]),
            ("python", vec!["-m", "venv", "venv"]),
            ("py", vec!["-3", "-m", "venv", "venv"]),
        ] {
            if run_cmd(cmd, &args, &sidecar).is_ok() {
                created = true;
                break;
            }
        }

        if !created {
            anyhow::bail!(
                "Failed to create OCR venv. Ensure Python 3 is available via `python3`, `python`, or `py -3`."
            );
        }
    }
    println!("\nInstalling dependencies...");
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

    println!("\nApplying patches...");
    let python = venv_python();
    let py = python.to_str().unwrap();
    run_cmd(py, &["patches/paddle_core.py"], &sidecar)?;

    println!("\nDownloading models...");
    run_cmd(py, &["download_models.py"], &sidecar)?;

    println!("\nBuilding executable...");
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

pub fn whisper() -> Result<()> {
    println!("\nBuilding Whisper STT sidecar...");
    let sidecar = xtask::whisper_sidecar_dir();
    let build_dir = sidecar.join("build");

    fs::create_dir_all(&build_dir)?;

    // Run CMake config
    println!("\nRunning CMake config...");
    run_cmd("cmake", &["..", "-DCMAKE_BUILD_TYPE=Release"], &build_dir)?;

    // Run CMake build
    println!("\nRunning CMake build...");
    run_cmd(
        "cmake",
        &["--build", ".", "--config", "Release"],
        &build_dir,
    )?;

    println!("\nSidecar build complete!");
    crate::commands::pkg::whisper()?;
    Ok(())
}
