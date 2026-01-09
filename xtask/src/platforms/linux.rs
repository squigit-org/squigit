// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Linux Qt deployment.
//!
//! Builds Qt project with CMake and bundles it using linuxdeployqt.
//! No more manual dependency resolution!

use anyhow::{Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn build(native_dir: &Path) -> Result<()> {
    let build_dir = native_dir.join("build");
    
    // 1. Configure CMake
    println!("  Configuring CMake...");
    fs::create_dir_all(&build_dir)?;

    let status = Command::new("cmake")
        .args([
            "-S",
            native_dir.to_str().unwrap(),
            "-B",
            build_dir.to_str().unwrap(),
            "-DCMAKE_BUILD_TYPE=Release",
            // We rely on the environment variables (Qt6_DIR) set in Docker
        ])
        .status()
        .context("Failed to run cmake configure")?;

    if !status.success() {
        anyhow::bail!("CMake configure failed");
    }

    // 2. Build
    println!("  Building...");
    let status = Command::new("cmake")
        .args([
            "--build",
            build_dir.to_str().unwrap(),
            "--config",
            "Release",
            "--parallel",
        ])
        .status()
        .context("Failed to run cmake build")?;

    if !status.success() {
        anyhow::bail!("CMake build failed");
    }

    Ok(())
}

pub fn deploy(native_dir: &Path) -> Result<()> {
    let build_dir = native_dir.join("build");
    let runtime_dir = native_dir.join("qt-runtime");

    println!("  Creating 'qt-runtime' distribution using linuxdeployqt...");
    create_runtime_distribution(native_dir, &build_dir, &runtime_dir)?;

    Ok(())
}

fn create_runtime_distribution(
    _native_dir: &Path,
    build_dir: &Path,
    runtime_dir: &Path,
) -> Result<()> {
    // Clean up previous build
    if runtime_dir.exists() {
        fs::remove_dir_all(runtime_dir)?;
    }

    // Create the structure linuxdeployqt expects: <AppDir>/usr/bin/
    let bin_dir = runtime_dir.join("usr/bin");
    fs::create_dir_all(&bin_dir)?;

    // Locate the built binary
    // Note: CMake lists OUTPUT_NAME as "capture-bin"
    let src_bin = build_dir.join("capture-bin");
    let dst_bin = bin_dir.join("capture-bin");

    if !src_bin.exists() {
        anyhow::bail!("Compiled binary not found at {}", src_bin.display());
    }

    // Copy binary to dist/usr/bin/
    fs::copy(&src_bin, &dst_bin)?;

    // Make it executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dst_bin, fs::Permissions::from_mode(0o755))?;
    }

    // RUN THE MAGIC TOOL
    // -bundle-non-qt-libs: includes SSL, etc.
    // -always-overwrite: Good for repeated local builds
    // -verbose=2: Helpful for CI debugging
    // -unsupported-allow-new-glibc: BYPASS safety check for Ubuntu 24.04+ (dev machines)
    // -qmake: Explicitly set qmake path to avoid using system default which might be Qt5 or broken
    let qmake_path = resolve_qmake_path();
    println!("  Using qmake: {}", qmake_path);

    // QML Source Directory
    let qmldir = _native_dir.join("qml");
    if !qmldir.exists() {
         anyhow::bail!("QML source directory not found at {}", qmldir.display());
    }

    // Remove problematic SQL driver plugins that have external dependencies (mimer, mysql, odbc, psql)
    // These plugins cause linuxdeployqt to fail because their dependencies aren't available
    if let Ok(qt6_dir) = std::env::var("Qt6_DIR") {
        let sqldrivers_dir = Path::new(&qt6_dir).join("plugins").join("sqldrivers");
        if sqldrivers_dir.exists() {
            for plugin in ["libqsqlmimer.so", "libqsqlmysql.so", "libqsqlodbc.so", "libqsqlpsql.so"] {
                let plugin_path = sqldrivers_dir.join(plugin);
                if plugin_path.exists() {
                    println!("  Removing problematic SQL plugin: {}", plugin);
                    let _ = fs::remove_file(&plugin_path);
                }
            }
        }
    }

    let mut cmd = Command::new("linuxdeployqt");
    cmd.arg(&dst_bin)
        .args([
            "-bundle-non-qt-libs", 
            "-always-overwrite", 
            "-verbose=2",
            "-unsupported-allow-new-glibc",
            &format!("-qmake={}", qmake_path),
            &format!("-qmldir={}", qmldir.display()),
        ]);

    // Fix: explicitly set LD_LIBRARY_PATH so ldd can find Qt libraries (like libQt6ShaderTools.so.6)
    if let Ok(qt6_dir) = std::env::var("Qt6_DIR") {
        let qt_lib_path = Path::new(&qt6_dir).join("lib");
        if qt_lib_path.exists() {
             println!("  Setting LD_LIBRARY_PATH to include: {}", qt_lib_path.display());
             // Append to existing LD_LIBRARY_PATH if any
             let current_path = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
             let new_path = if current_path.is_empty() {
                 qt_lib_path.to_string_lossy().into_owned()
             } else {
                 format!("{}:{}", qt_lib_path.display(), current_path)
             };
             cmd.env("LD_LIBRARY_PATH", new_path);
        }
    }

    let status = cmd
        .status()
        .context("Failed to execute linuxdeployqt")?;

    if !status.success() {
        anyhow::bail!("linuxdeployqt failed to bundle the application.");
    }

    println!("  Success! Portable runtime created at: {}", runtime_dir.display());
    println!("  Launch it using: {}/AppRun", runtime_dir.display());

    Ok(())
}

fn resolve_qmake_path() -> String {
    // 1. Check env var
    if let Ok(path) = std::env::var("QMAKE") {
        return path;
    }

    // 2. Check for qmake6
    if which::which("qmake6").is_ok() {
        return "qmake6".to_string();
    }

    // 3. Check for qmake-qt6
    if which::which("qmake-qt6").is_ok() {
        return "qmake-qt6".to_string();
    }

    // 4. Check for qmake (could be Qt5 or broken, but it's a fallback)
    if let Ok(output) = Command::new("qmake").arg("-v").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("Qt version 6") {
            return "qmake".to_string();
        }
    }

    // Default fallback
    "qmake".to_string()
}