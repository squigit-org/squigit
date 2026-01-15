// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use std::fs;
use xtask::{ocr_sidecar_dir, project_root, qt_native_dir, tauri_dir};

pub fn all() -> Result<()> {
    ocr()?;
    capture()?;
    app()?;
    Ok(())
}

pub fn capture() -> Result<()> {
    println!("\nCleaning capture engine artifacts...");

    let native_dir = qt_native_dir();

    for dir in ["build", "dist"] {
        let path = native_dir.join(dir);
        if path.exists() {
            println!("  Removing {}", path.display());
            fs::remove_dir_all(&path)?;
        }
    }

    let qt_runtime = project_root()
        .join("target")
        .join("release")
        .join("qt-runtime");
    if qt_runtime.exists() {
        println!("  Removing {}", qt_runtime.display());
        fs::remove_dir_all(&qt_runtime)?;
    }

    Ok(())
}

pub fn ocr() -> Result<()> {
    println!("\nCleaning OCR sidecar artifacts...");

    let sidecar = ocr_sidecar_dir();

    for dir in ["venv", "build", "dist", "models"] {
        let path = sidecar.join(dir);
        if path.exists() {
            println!("  Removing {}", path.display());
            fs::remove_dir_all(&path)?;
        }
    }

    Ok(())
}

pub fn app() -> Result<()> {
    println!("\nCleaning Tauri app artifacts...");

    let tauri_target = tauri_dir().join("target");
    if tauri_target.exists() {
        println!("  Removing {}", tauri_target.display());
        fs::remove_dir_all(&tauri_target)?;
    }

    let binaries = tauri_dir().join("binaries");
    if binaries.exists() {
        for entry in fs::read_dir(&binaries)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("ocr-engine-") || name.starts_with("capture-engine-") {
                println!("  Removing {}", entry.path().display());
                fs::remove_file(entry.path())?;
            }
        }
    }

    Ok(())
}
