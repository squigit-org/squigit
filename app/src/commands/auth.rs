// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, File};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};

use crate::services::auth;
use crate::services::security;
use crate::state::AppState;
use crate::utils::get_app_config_dir;

#[tauri::command]
pub async fn start_google_auth(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.auth_running.load(Ordering::SeqCst) {
        return Err("Authentication already in progress".into());
    }

    state.auth_running.store(true, Ordering::SeqCst);
    let auth_lock = state.auth_running.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);
        if !config_dir.exists() {
            match fs::create_dir_all(&config_dir) {
                Ok(_) => {}
                Err(e) => return Err(e.to_string()),
            }
        }

        auth::start_google_auth_flow(app, config_dir)
    })
    .await;

    auth_lock.store(false, Ordering::SeqCst);

    result.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);

        let _ = fs::remove_file(config_dir.join("profile.json")).ok();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_user_data(app: AppHandle) -> serde_json::Value {
    let config_dir = get_app_config_dir(&app);
    let profile_path = config_dir.join("profile.json");

    if profile_path.exists() {
        if let Ok(file) = File::open(profile_path) {
            if let Ok(json) = serde_json::from_reader(file) {
                return json;
            }
        }
    }

    serde_json::json!({
        "name": "Guest User",
        "email": "Not logged in",
        "avatar": ""
    })
}

#[tauri::command]
pub async fn get_api_key(app: AppHandle, provider: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        security::get_decrypted_key_internal(&app, &provider).unwrap_or_default()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Cache an avatar image from a remote URL to local CAS storage.
/// Returns the local file path on success.
#[tauri::command]
pub async fn cache_avatar(app: AppHandle, url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);
        
        // Download image
        let client = reqwest::blocking::Client::new();
        let response = client
            .get(&url)
            .send()
            .map_err(|e| format!("Failed to download avatar: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Failed to download avatar: HTTP {}", response.status()));
        }
        
        let bytes = response
            .bytes()
            .map_err(|e| format!("Failed to read avatar bytes: {}", e))?;
        
        // Save to CAS
        let storage = ops_chat_storage::storage::ChatStorage::new()
            .map_err(|e| format!("Failed to initialize storage: {}", e))?;
        
        let stored_image = storage
            .store_image(&bytes)
            .map_err(|e| format!("Failed to store avatar: {}", e))?;
        
        let local_path = stored_image.path.clone();
        
        // Update profile.json with new avatar path
        let profile_path = config_dir.join("profile.json");
        if profile_path.exists() {
            if let Ok(file) = File::open(&profile_path) {
                if let Ok(mut profile) = serde_json::from_reader::<_, serde_json::Value>(file) {
                    if let Some(obj) = profile.as_object_mut() {
                        obj.insert("avatar".to_string(), serde_json::Value::String(local_path.clone()));
                        if let Ok(updated_json) = serde_json::to_string_pretty(&profile) {
                            let _ = fs::write(&profile_path, updated_json);
                        }
                    }
                }
            }
        }
        
        Ok(local_path)
    })
    .await
    .map_err(|e| e.to_string())?
}
