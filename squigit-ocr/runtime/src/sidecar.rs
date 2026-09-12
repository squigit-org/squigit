// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use semver::Version;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SidecarError {
    #[error("ERR_MISSING_OCR_PACKAGE")]
    MissingPackage,
    #[error("Failed to parse OCR sidecar version")]
    VersionParseFailed,
}

pub fn resolve_sidecar_path() -> PathBuf {
    let name = if cfg!(windows) {
        "squigit-ocr.exe"
    } else {
        "squigit-ocr"
    };

    if let Ok(path) = which::which(name) {
        return path;
    }

    #[cfg(target_os = "macos")]
    {
        let brew_arm = PathBuf::from("/opt/homebrew/bin/squigit-ocr");
        let brew_intel = PathBuf::from("/usr/local/bin/squigit-ocr");
        if brew_arm.exists() {
            return brew_arm;
        }
        if brew_intel.exists() {
            return brew_intel;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let winget_path = PathBuf::from(local_app_data)
                .join("Microsoft")
                .join("WindowsApps")
                .join("squigit-ocr.exe");
            if winget_path.exists() {
                return winget_path;
            }
        }
    }

    PathBuf::from(name)
}

pub fn read_sidecar_version(sidecar_path: &Path) -> Result<String, SidecarError> {
    let mut cmd = std::process::Command::new(sidecar_path);
    cmd.arg("--version");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|_| SidecarError::MissingPackage)?;

    if !output.status.success() {
        return Err(SidecarError::MissingPackage);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = extract_semver_from_text(&stdout).ok_or(SidecarError::VersionParseFailed)?;
    Ok(version.to_string())
}

fn extract_semver_from_text(raw: &str) -> Option<Version> {
    let mut candidates = raw
        .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '+'))
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    candidates.reverse();

    for token in candidates {
        if let Ok(version) = Version::parse(token) {
            return Some(version);
        }
    }

    None
}
