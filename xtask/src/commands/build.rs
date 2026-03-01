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
    let python = venv_python();
    let py = python.to_str().unwrap();
    run_cmd(
        py,
        &["-m", "pip", "install", "-r", "requirements.txt"],
        &sidecar,
    )?;
    run_cmd(
        py,
        &[
            "-c",
            r###"import importlib, pathlib, sys
req = {}
for line in pathlib.Path("requirements.txt").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "==" not in line:
        continue
    name, version = [v.strip() for v in line.split("==", 1)]
    req[name.lower()] = version

module_map = {
    "paddlepaddle": "paddle",
    "paddleocr": "paddleocr",
    "paddlex": "paddlex",
    "pyinstaller": "PyInstaller",
}

errors = []
for package, expected in req.items():
    module_name = module_map.get(package, package)
    try:
        mod = importlib.import_module(module_name)
    except Exception as exc:
        errors.append(f"{package}: import failed: {exc}")
        continue

    actual = getattr(mod, "__version__", None)
    if actual != expected:
        errors.append(f"{package}: expected {expected}, got {actual}")

if errors:
    print("OCR dependency verification failed:")
    print("\n".join(errors))
    sys.exit(1)

print("OCR dependency verification passed.")"###,
        ],
        &sidecar,
    )?;

    println!("\nApplying patches...");
    run_cmd(py, &["patches/paddle_core.py"], &sidecar)?;

    println!("\nDownloading models...");
    run_cmd(py, &["download_models.py"], &sidecar)?;

    println!("\nBuilding executable...");
    run_cmd(
        py,
        &["-m", "PyInstaller", "--clean", "ocr-engine.spec"],
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
