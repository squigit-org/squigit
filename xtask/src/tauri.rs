// Copyright 2025 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Tauri application build and run automation.
//!
//! Handles running Tauri CLI commands without requiring npm as
//! the primary interface.

use anyhow::Result;
use std::fs;

use crate::utils::{project_root, run_cmd, run_cmd_with_node_bin};

/// Get the UI directory path.
pub fn ui_dir() -> std::path::PathBuf {
    project_root().join("ui")
}

/// Get the Tauri app directory path.
pub fn tauri_dir() -> std::path::PathBuf {
    project_root().join("app")
}

/// Run a Tauri command (dev, build, etc.).
pub fn run(cmd: &str) -> Result<()> {
    let ui = ui_dir();
    let app = tauri_dir();
    let node_bin = ui.join("node_modules").join(".bin");
    
    // Ensure dependencies are installed
    if !ui.join("node_modules").exists() {
        println!("\n📥 Installing npm dependencies...");
        run_cmd("npm", &["install"], &ui)?;
    }
    
    println!("\n🚀 Running: tauri {}", cmd);
    run_cmd_with_node_bin("tauri", &[cmd], &app, &node_bin)?;
    
    Ok(())
}

/// Build the Tauri application for release.
pub fn build() -> Result<()> {
    println!("\n🔨 Building Tauri app...");
    let ui = ui_dir();
    let app = tauri_dir();
    let node_bin = ui.join("node_modules").join(".bin");
    
    // Ensure dependencies are installed
    if !ui.join("node_modules").exists() {
        println!("\n📥 Installing npm dependencies...");
        run_cmd("npm", &["install"], &ui)?;
    }
    
    // Build Tauri
    run_cmd_with_node_bin("tauri", &["build"], &app, &node_bin)?;
    
    println!("\n✅ App build complete!");
    Ok(())
}

/// Clean Tauri build artifacts.
pub fn clean() -> Result<()> {
    println!("\n🧹 Cleaning Tauri artifacts...");
    
    // Clean Tauri build
    let tauri_target = tauri_dir().join("target");
    if tauri_target.exists() {
        println!("  Removing {}", tauri_target.display());
        fs::remove_dir_all(&tauri_target)?;
    }
    
    // Clean binaries
    let binaries = tauri_dir().join("binaries");
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
