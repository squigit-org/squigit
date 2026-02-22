// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn encrypt_and_save(
    _app: AppHandle,
    _profile_id: String,
    _provider: String,
    _key: String,
) -> Result<(), String> {
    // TODO: The function `ops_profile_store::set_api_key` does not exist.
    // The logic for saving API keys needs to be implemented correctly.
    // let result = ops_profile_store::set_api_key(&app, &profile_id, &provider, &key);
    // match result {
    //     Ok(_) => Ok(()),
    //     Err(e) => Err(e.to_string()),
    // }
    Ok(())
}

#[tauri::command]
pub fn set_agreed_flag(app: AppHandle) -> Result<(), String> {
    let config_dir = match app.path().app_config_dir() {
        Ok(path) => path,
        Err(e) => return Err(format!("Could not resolve app config dir: {}", e)),
    };

    if !config_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&config_dir) {
            return Err(format!("Failed to create config dir: {}", e));
        }
    }
    let marker_file = config_dir.join(".agreed");
    if let Err(e) = std::fs::write(&marker_file, "") {
        log::error!("Failed to create .agreed marker file: {}", e);
        Err(format!("Failed to create .agreed marker file: {}", e))
    } else {
        log::info!("Successfully created .agreed marker file");
        Ok(())
    }
}
