// Copyright 2025 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Tauri application build and run automation.
//!
//! Handles running Tauri CLI commands without requiring npm as
//! the primary interface.

use anyhow::Result;
use std::fs;

use crate::utils::{project_root, run_cmd};

/// Get the app directory path.
pub fn app_dir() -> std::path::PathBuf {
    project_root().join("app")
}

/// Run a Tauri command (dev, build, etc.).
pub fn run(cmd: &str) -> Result<()> {
    let app = app_dir();
    
    // Ensure dependencies are installed
    if !app.join("node_modules").exists() {
        println!("\n📥 Installing npm dependencies...");
        run_cmd("npm", &["install"], &app)?;
    }
    
    println!("\n🚀 Running: tauri {}", cmd);
    run_cmd("npm", &["run", "tauri", cmd], &app)?;
    
    Ok(())
}

/// Build the Tauri application for release.
pub fn build() -> Result<()> {
    println!("\n🔨 Building Tauri app...");
    let app = app_dir();
    
    // Ensure dependencies are installed
    if !app.join("node_modules").exists() {
        println!("\n📥 Installing npm dependencies...");
        run_cmd("npm", &["install"], &app)?;
    }
    
    // Build Tauri
    run_cmd("npm", &["run", "tauri", "build"], &app)?;
    
    println!("\n✅ App build complete!");
    Ok(())
}

/// Clean Tauri build artifacts.
pub fn clean() -> Result<()> {
    println!("\n🧹 Cleaning Tauri artifacts...");
    
    // Clean Tauri build
    let tauri_target = app_dir().join("src-tauri").join("target");
    if tauri_target.exists() {
        println!("  Removing {}", tauri_target.display());
        fs::remove_dir_all(&tauri_target)?;
    }
    
    // Clean binaries
    let binaries = app_dir().join("src-tauri").join("binaries");
    if binaries.exists() {
        for entry in fs::read_dir(&binaries)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with("ocr-engine-") {
                println!("  Removing {}", entry.path().display());
                fs::remove_file(entry.path())?;
            }
        }
    }
    
    Ok(())
}
