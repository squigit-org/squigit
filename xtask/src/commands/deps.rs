// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Frozen Tauri v0.1.1 dependency resolution.
//!
//! Downloads prebuilt artifacts (renderer dist, qt-capture binary, crate sources)
//! from the `squigit-org/tauri-v0-archive` GitHub Releases repository on first run,
//! caching them in `target/tauri-archive/`.

use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use xtask::{get_host_target_triple, tauri_archive_dir, tauri_dir};

const ARCHIVE_REPO: &str = "squigit-org/tauri-v0-archive";
const ARCHIVE_TAG: &str = "v0.1.1";

/// Resolved paths to the frozen Tauri dependencies.
pub struct TauriDeps {
    /// Path to the frozen Vite renderer build output.
    pub renderer_dist: PathBuf,
    /// Path to the qt-capture sidecar directory (binary + runtime).
    pub qt_capture: PathBuf,
    /// Path to the frozen crate sources.
    pub crates: PathBuf,
}

impl TauriDeps {
    fn from_archive(archive: &PathBuf, triple: &str) -> Self {
        Self {
            renderer_dist: archive.join("renderer-dist"),
            qt_capture: archive.join(format!("qt-capture-{triple}")),
            crates: archive.join("crates"),
        }
    }
}

/// Ensures the frozen Tauri v0.1.1 dependencies are available locally.
///
/// If `target/tauri-archive/` does not exist or is incomplete, downloads
/// the platform-specific tarball from the archive repository and extracts it.
/// After successful extraction, copies the qt-capture sidecar into
/// `apps/tauri/binaries/` so the Tauri CLI can locate it.
pub fn ensure_tauri_deps() -> Result<TauriDeps> {
    let archive = tauri_archive_dir();
    let sentinel = archive.join(".complete");
    let triple = get_host_target_triple()?;

    if !sentinel.exists() {
        fs::create_dir_all(&archive)?;

        let asset = format!("tauri-deps-{triple}.tar.gz");
        let url = format!(
            "https://github.com/{ARCHIVE_REPO}/releases/download/{ARCHIVE_TAG}/{asset}"
        );

        println!("\nDownloading frozen Tauri v0.1.1 dependencies...");
        println!("  {url}");

        download_and_extract(&url, &archive)
            .context("Failed to download Tauri v0.1.1 archive.\nEnsure you have internet access and the archive repo exists.")?;

        fs::write(&sentinel, "v0.1.1")?;
        println!("  Dependencies cached in {}", archive.display());
    }

    let deps = TauriDeps::from_archive(&archive, &triple);

    // Validate critical paths exist
    if !deps.crates.exists() {
        anyhow::bail!(
            "Tauri archive is corrupted: crates/ not found in {}\nRun `cargo xtask clean` and retry.",
            archive.display()
        );
    }

    // Copy qt-capture sidecar into apps/tauri/binaries/ if not already there
    let tauri_binaries = tauri_dir().join("binaries");
    let sidecar_name = format!("qt-capture-{triple}");
    let sidecar_dst = tauri_binaries.join(&sidecar_name);

    if deps.qt_capture.exists() && !sidecar_dst.exists() {
        println!("  Copying qt-capture sidecar to apps/tauri/binaries/");
        fs::create_dir_all(&tauri_binaries)?;
        xtask::copy_dir_all(&deps.qt_capture, &sidecar_dst)?;
    }

    Ok(deps)
}

/// Downloads a tarball from `url` and extracts it into `dst`.
fn download_and_extract(url: &str, dst: &std::path::Path) -> Result<()> {
    let tarball = dst.join("_download.tar.gz");

    // Download using curl (available on all platforms)
    let status = std::process::Command::new("curl")
        .args(["-fSL", "--progress-bar", "-o"])
        .arg(&tarball)
        .arg(url)
        .status()
        .context("curl is required to download dependencies")?;

    if !status.success() {
        anyhow::bail!("Download failed. Check the URL and your network connection.");
    }

    // Extract
    println!("  Extracting...");
    let status = std::process::Command::new("tar")
        .args(["-xzf"])
        .arg(&tarball)
        .arg("-C")
        .arg(dst)
        .status()
        .context("tar is required to extract dependencies")?;

    if !status.success() {
        anyhow::bail!("Extraction failed.");
    }

    // Clean up tarball
    let _ = fs::remove_file(&tarball);

    Ok(())
}
