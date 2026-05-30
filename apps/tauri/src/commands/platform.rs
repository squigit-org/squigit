// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Window control, capture, system utils, constants, theme.
//! Everything Tauri-native (window APIs) plus thin wrappers for shared platform logic.

use tauri::window::Color;
use tauri::{AppHandle, Manager};

use crate::constants::*;
use crate::services::ocr::DesktopOcrService;

// =============================================================================
// Window Control
// =============================================================================

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    println!("Opening URL: {}", url);
    tauri::async_runtime::spawn_blocking(move || squigit_brain::system::open_external_url(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn set_background_color(app: AppHandle, color: String) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let color = color.trim_start_matches('#');
    let (r, g, b) = if color.len() == 6 {
        let r = u8::from_str_radix(&color[0..2], 16).map_err(|e| e.to_string())?;
        let g = u8::from_str_radix(&color[2..4], 16).map_err(|e| e.to_string())?;
        let b = u8::from_str_radix(&color[4..6], 16).map_err(|e| e.to_string())?;
        (r, g, b)
    } else {
        return Err("Invalid color format. Use #RRGGBB".to_string());
    };

    let _ = window.set_background_color(Some(Color(r, g, b, 255)));
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn maximize_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reload_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    window
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, state: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    window.set_always_on_top(state).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    crate::services::tray::show_window(&app);
    Ok(())
}

#[tauri::command]
pub fn get_always_on_top(app: AppHandle) -> Result<bool, String> {
    let _window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    Ok(false)
}

// =============================================================================
// Capture
// =============================================================================

#[tauri::command]
pub fn spawn_capture(app: AppHandle) -> Result<(), String> {
    crate::services::capture::spawn_capture(&app);
    Ok(())
}

#[tauri::command]
pub fn spawn_capture_to_input(app: AppHandle) -> Result<(), String> {
    crate::services::capture::spawn_capture_to_input(&app);
    Ok(())
}

// =============================================================================
// System Utils
// =============================================================================

#[tauri::command]
pub async fn run_sidecar_version(
    app: tauri::AppHandle,
    ocr: tauri::State<'_, DesktopOcrService>,
    command: String,
) -> Result<String, String> {
    if command == "squigit-ocr --version" {
        let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
        let (sidecar_path, _) = ocr.resolve_sidecar_path(&resource_dir);
        return ocr.read_sidecar_version(&sidecar_path);
    }

    if command == "squigit-stt --version" {
        let (sidecar_path, _) = desktop_runtime::sidecar::resolve_stt_sidecar_path()?;
        let output = std::process::Command::new(sidecar_path)
            .arg("--version")
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
        return Err("Sidecar command failed".to_string());
    }

    Err("Unknown or unsupported sidecar command".to_string())
}

#[tauri::command]
pub async fn get_linux_package_manager() -> Result<String, String> {
    Ok(desktop_runtime::platform::get_linux_package_manager())
}

// =============================================================================
// Theme
// =============================================================================

#[tauri::command]
pub fn get_system_theme() -> String {
    desktop_runtime::platform::get_system_theme()
}

// =============================================================================
// Constants
// =============================================================================

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConstants {
    pub app_name: &'static str,
    pub default_model: &'static str,
    pub default_theme: &'static str,
    pub default_prompt: &'static str,
    pub preferences_file_name: &'static str,
    pub default_capture_type: &'static str,
    pub default_ocr_language: &'static str,
    pub default_active_account: &'static str,
}

#[tauri::command]
pub fn get_app_constants() -> AppConstants {
    AppConstants {
        app_name: APP_NAME,
        default_model: DEFAULT_MODEL,
        default_theme: DEFAULT_THEME,
        default_prompt: DEFAULT_PROMPT,
        preferences_file_name: PREFERENCES_FILE_NAME,
        default_capture_type: DEFAULT_CAPTURE_TYPE,
        default_ocr_language: DEFAULT_OCR_LANGUAGE,
        default_active_account: DEFAULT_ACTIVE_ACCOUNT,
    }
}
