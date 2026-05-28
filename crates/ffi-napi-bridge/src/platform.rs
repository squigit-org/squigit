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
    ops_host_runtime::platform::get_system_theme()
}

#[napi]
pub fn get_linux_package_manager() -> String {
    ops_host_runtime::platform::get_linux_package_manager()
}

#[napi]
pub fn reveal_in_file_manager(path: String) -> Result<()> {
    ops_host_runtime::platform::reveal_in_file_manager(path)
        .map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Sidecar
// =============================================================================

#[napi]
pub fn check_stt_version() -> Result<()> {
    let (binary_path, _) = ops_host_runtime::sidecar::resolve_stt_sidecar_path()
        .map_err(|e| napi::Error::from_reason(e))?;

    ops_host_runtime::sidecar::check_stt_version(&binary_path)
        .map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Security
// =============================================================================

#[napi]
pub fn encrypt_and_save(profile_id: String, provider: String, plaintext: String) -> Result<()> {
    ops_host_runtime::security::encrypt_and_save(&profile_id, &provider, &plaintext)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn set_agreed_flag() -> Result<()> {
    ops_host_runtime::security::set_agreed_flag()
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn has_agreed_flag() -> bool {
    ops_host_runtime::security::has_agreed_flag()
}

#[napi]
pub fn check_file_exists(path: String) -> bool {
    ops_host_runtime::security::check_file_exists(&path)
}
