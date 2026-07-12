// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Desktop platform NAPI wrappers — theme, sidecar, platform info.
//! Only compiled with --features desktop.

use napi::Result;
use napi_derive::napi;

#[napi(js_name = "get_system_theme")]
pub fn get_system_theme() -> String {
    desktop_runtime::platform::get_system_theme()
}

#[napi(js_name = "get_linux_package_manager")]
pub fn get_linux_package_manager() -> String {
    desktop_runtime::platform::get_linux_package_manager()
}

#[napi(js_name = "run_sidecar_version")]
pub async fn run_sidecar_version(command: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        if command == "squigit-ocr --version" {
            let current_exe = std::env::current_exe().unwrap_or_default();
            let resource_dir = current_exe.parent().unwrap_or(std::path::Path::new(""));
            let (sidecar_path, _) = ocr_runtime::sidecar::resolve_sidecar_path(resource_dir);
            return ocr_runtime::sidecar::read_sidecar_version(&sidecar_path)
                .map_err(|e| napi::Error::from_reason(e.to_string()));
        }

        if command == "squigit-stt --version" {
            return crate::sidecar::read_stt_version();
        }

        Err(napi::Error::from_reason(
            "Unknown or unsupported sidecar command",
        ))
    })
    .await
    .unwrap_or_else(|e| Err(napi::Error::from_reason(e.to_string())))
}

#[napi(js_name = "get_machine_info")]
pub fn get_machine_info() -> String {
    desktop_runtime::platform::get_machine_info()
}
