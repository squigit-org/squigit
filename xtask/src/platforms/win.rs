// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0
#![allow(dead_code)]

//! Windows Qt deployment.
//!
//! Builds Qt project with CMake and uses windeployqt for bundling.

use anyhow::{Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn build(native_dir: &Path) -> Result<()> {
    let build_dir = native_dir.join("build");

    let qt_path = find_qt_path()?;
    println!("  Qt Path: {}", qt_path);

    println!("  Configuring CMake...");
    if build_dir.exists() {
        fs::remove_dir_all(&build_dir)?;
    }
    fs::create_dir_all(&build_dir)?;

    let status = Command::new("cmake")
        .args([
            "-S",
            native_dir.to_str().unwrap(),
            "-B",
            build_dir.to_str().unwrap(),
            "-G",
            "Ninja",
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_C_COMPILER=cl.exe",
            "-DCMAKE_CXX_COMPILER=cl.exe",
            &format!("-DCMAKE_PREFIX_PATH={}", qt_path),
        ])
        .status()
        .context("Failed to run cmake configure")?;

    if !status.success() {
        anyhow::bail!("CMake configure failed");
    }

    println!("  Building...");
    let status = Command::new("cmake")
        .args([
            "--build",
            build_dir.to_str().unwrap(),
            "--config",
            "Release",
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
    let dist_dir = native_dir.join("qt-runtime"); // Changed dist to qt-runtime for consistency

    let qt_path = find_qt_path()?;

    println!("  Running windeployqt...");
    create_distribution(&build_dir, &dist_dir, &qt_path)?;

    Ok(())
}

fn find_qt_path() -> Result<String> {
    if let Ok(qt_dir) = std::env::var("Qt6_DIR") {
        if Path::new(&qt_dir).exists() {
            return Ok(qt_dir);
        }
    }

    if let Ok(output) = Command::new("qmake")
        .arg("-query")
        .arg("QT_INSTALL_PREFIX")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if Path::new(&path).exists() {
                return Ok(path);
            }
        }
    }

    let candidates = [
        r"C:\Qt\6.6.0\msvc2019_64",
        r"C:\Qt\6.7.0\msvc2019_64",
        r"C:\Qt\6.8.0\msvc2019_64",
    ];

    for candidate in candidates {
        if Path::new(candidate).exists() {
            return Ok(candidate.to_string());
        }
    }

    anyhow::bail!("Qt6 not found. Set Qt6_DIR environment variable or install Qt.")
}

fn create_distribution(build_dir: &Path, dist_dir: &Path, qt_path: &str) -> Result<()> {
    if dist_dir.exists() {
        fs::remove_dir_all(dist_dir)?;
    }
    fs::create_dir_all(dist_dir)?;

    let exe_name = "capture.exe";
    let exe_src = build_dir.join(exe_name);
    let exe_dst = dist_dir.join(exe_name);

    if !exe_src.exists() {
        let release_exe = build_dir.join("Release").join(exe_name);
        if release_exe.exists() {
            fs::copy(&release_exe, &exe_dst)?;
        } else {
            anyhow::bail!("Built exe not found: {}", exe_src.display());
        }
    } else {
        fs::copy(&exe_src, &exe_dst)?;
    }

    let windeployqt = Path::new(qt_path).join("bin").join("windeployqt.exe");

    if windeployqt.exists() {
        let status = Command::new(&windeployqt)
            .current_dir(dist_dir)
            .args([
                exe_name,
                "--release",
                "--compiler-runtime",
                "--no-translations",
                "--no-opengl-sw",
                "--no-system-d3d-compiler",
            ])
            .status()
            .context("Failed to run windeployqt")?;

        if !status.success() {
            println!("  Warning: windeployqt failed");
        }
    } else {
        anyhow::bail!("windeployqt not found at {}", windeployqt.display());
    }

    bundle_vc_runtime(dist_dir)?;

    Ok(())
}

fn bundle_vc_runtime(dist_dir: &Path) -> Result<()> {
    let system32 = std::env::var("SystemRoot")
        .map(|r| Path::new(&r).join("System32"))
        .unwrap_or_else(|_| Path::new(r"C:\Windows\System32").to_path_buf());

    let runtime_dlls = [
        "vcruntime140.dll",
        "vcruntime140_1.dll",
        "msvcp140.dll",
        "msvcp140_1.dll",
        "ucrtbase.dll",
    ];

    for dll in runtime_dlls {
        let src = system32.join(dll);
        if src.exists() {
            let dst = dist_dir.join(dll);
            if !dst.exists() {
                fs::copy(&src, &dst)?;
            }
        }
    }

    Ok(())
}
