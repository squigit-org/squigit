// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Desktop platform NAPI wrappers — theme, sidecar, security.
//! Only compiled with --features desktop.

use napi::Result;
use napi_derive::napi;

// =============================================================================
// Theme
// =============================================================================

#[napi]
pub fn get_system_theme() -> String {
    desktop_runtime::platform::get_system_theme()
}

#[napi]
pub fn get_linux_package_manager() -> String {
    desktop_runtime::platform::get_linux_package_manager()
}

#[napi]
pub fn reveal_in_file_manager(path: String) -> Result<()> {
    desktop_runtime::platform::reveal_in_file_manager(path).map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Sidecar
// =============================================================================

#[napi]
pub fn check_stt_version() -> Result<()> {
    let (binary_path, _) = desktop_runtime::sidecar::resolve_stt_sidecar_path()
        .map_err(|e| napi::Error::from_reason(e))?;

    desktop_runtime::sidecar::check_stt_version(&binary_path)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub async fn run_sidecar_version(command: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        if command == "squigit-ocr --version" {
            let current_exe = std::env::current_exe().unwrap_or_default();
            let resource_dir = current_exe.parent().unwrap_or(std::path::Path::new(""));
            let (sidecar_path, _) = squigit_ocr::sidecar::resolve_sidecar_path(resource_dir);
            return squigit_ocr::sidecar::read_sidecar_version(&sidecar_path)
                .map_err(|e| napi::Error::from_reason(e.to_string()));
        }

        if command == "squigit-stt --version" {
            let (sidecar_path, _) = desktop_runtime::sidecar::resolve_stt_sidecar_path()
                .map_err(|e| napi::Error::from_reason(e))?;

            let mut cmd = std::process::Command::new(sidecar_path);
            cmd.arg("--version");

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            let output = cmd
                .output()
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // Try to extract just the version if there's noise
                let version = stdout.lines().last().unwrap_or("").trim().to_string();
                return Ok(version);
            }
            return Err(napi::Error::from_reason("Sidecar command failed"));
        }

        Err(napi::Error::from_reason(
            "Unknown or unsupported sidecar command",
        ))
    })
    .await
    .unwrap_or_else(|e| Err(napi::Error::from_reason(e.to_string())))
}

// =============================================================================
// Security
// =============================================================================

#[napi]
pub fn encrypt_and_save(profile_id: String, provider: String, plaintext: String) -> Result<()> {
    desktop_runtime::security::encrypt_and_save(&profile_id, &provider, &plaintext)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn set_agreed_flag() -> Result<()> {
    desktop_runtime::security::set_agreed_flag().map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn has_agreed_flag() -> bool {
    desktop_runtime::security::has_agreed_flag()
}

#[napi]
pub fn check_file_exists(path: String) -> bool {
    desktop_runtime::security::check_file_exists(&path)
}

#[napi]
pub fn get_machine_info() -> String {
    desktop_runtime::platform::get_machine_info()
}
