// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::{AppHandle, Manager};

use crate::services::security;
use crate::utils::get_app_config_dir;

#[tauri::command]
pub async fn encrypt_and_save(
    app: AppHandle,
    plaintext: String,
    provider: String,
    profile_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = security::encrypt_and_save_key(&app, &plaintext, &provider, &profile_id)?;

        if provider == "imgbb" {
            if let Some(win) = app.get_webview_window("imgbb-setup") {
                let _ = win.close();
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn check_file_exists(app: AppHandle, filename: String, profile_id: Option<String>) -> bool {
    let base_dir = get_app_config_dir(&app);
    let path = match profile_id {
        Some(id) => base_dir.join("Local Storage").join(id).join(filename),
        None => base_dir.join(filename),
    };
    path.exists()
}
