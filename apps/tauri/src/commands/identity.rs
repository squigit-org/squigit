// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Auth, profile CRUD, security (was auth.rs + profile.rs + security.rs).

use std::sync::Arc;
use std::sync::atomic::Ordering;
use squigit_auth::auth::{self, AuthFlowSettings};
use squigit_auth::{Profile, ProfileError, ProfileStore};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

// =============================================================================
// Auth
// =============================================================================

const MISSING_CREDENTIALS_PREFIX: &str = "Google authentication is not configured in this build.";

#[derive(Debug, Clone, Serialize)]
struct AuthFailureData {
    error: String,
    cancelled: bool,
}

fn build_auth_settings() -> AuthFlowSettings {
    AuthFlowSettings::new(
        crate::constants::APP_NAME,
        Arc::new(|url| crate::utils::open_url(url).map_err(ProfileError::Auth)),
    )
}

fn log_auth_error(error: &str) {
    if error.starts_with(MISSING_CREDENTIALS_PREFIX) {
        return;
    }

    eprintln!(
        "[auth] start_google_auth failed: {}",
        error.replace('\n', "\n[auth] ")
    );
}

#[tauri::command]
pub async fn start_google_auth(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.auth_running.load(Ordering::SeqCst) {
        return Err("Authentication already in progress".into());
    }

    state.auth_running.store(true, Ordering::SeqCst);
    state.auth_cancelled.store(false, Ordering::SeqCst);
    let auth_lock = state.auth_running.clone();
    let auth_cancelled = state.auth_cancelled.clone();
    let app_for_success = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let store = ProfileStore::new().map_err(|err| err.to_string())?;
        let settings = build_auth_settings();
        let user_data =
            auth::start_google_auth_flow(&store, &settings, auth_cancelled).map_err(|err| err.to_string())?;
        app_for_success.emit("auth-success", &user_data)
            .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await;

    auth_lock.store(false, Ordering::SeqCst);

    let result = result.map_err(|e| e.to_string())?;
    if let Err(ref e) = result {
        log_auth_error(e);
        let is_cancelled = e.contains("cancelled") || e.contains("expired");
        let payload = AuthFailureData {
            error: e.clone(),
            cancelled: is_cancelled,
        };
        if let Err(emit_err) = app.emit("auth-failure", &payload) {
            eprintln!("[auth] failed to emit auth-failure: {}", emit_err);
        }
    }
    result
}

#[tauri::command]
pub async fn cancel_google_auth(_app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if !state.auth_running.load(Ordering::SeqCst) {
        return Ok(());
    }

    state.auth_cancelled.store(true, Ordering::SeqCst);
    let cancel_url = build_auth_settings().cancel_url();

    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::new();
        let _ = client.get(cancel_url).send();
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn logout(_app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(store) = ProfileStore::new() {
            let _ = store.clear_active_profile_id();
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_api_key(
    provider: String,
    profile_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|err| err.to_string())?;
        let provider = std::str::FromStr::from_str(&provider)
            .map_err(|e: squigit_auth::ProfileError| e.to_string())?;
        let key = squigit_auth::security::get_decrypted_key(&store, provider, &profile_id)
            .map_err(|err| err.to_string())?;
        Ok::<String, String>(key.unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cache_avatar(
    _app: AppHandle,
    url: String,
    profile_id: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|err| err.to_string())?;
        auth::cache_avatar(&store, &url, profile_id.as_deref()).map_err(|err| err.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// =============================================================================
// Profile CRUD
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct ProfileInfo {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar: Option<String>,
    pub original_avatar: Option<String>,
}

impl From<Profile> for ProfileInfo {
    fn from(p: Profile) -> Self {
        Self {
            id: p.id,
            name: p.name,
            email: p.email,
            avatar: p.avatar,
            original_avatar: p.original_avatar,
        }
    }
}

#[tauri::command]
pub async fn get_active_profile() -> Result<Option<ProfileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        let profile = store.get_active_profile().map_err(|e| e.to_string())?;
        Ok(profile.map(ProfileInfo::from))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_active_profile_id() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        store.get_active_profile_id().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_active_profile(profile_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        store
            .set_active_profile_id(&profile_id)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_profiles() -> Result<Vec<ProfileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        let profiles = store.list_profiles().map_err(|e| e.to_string())?;
        Ok(profiles.into_iter().map(ProfileInfo::from).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_profile(profile_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        store.delete_profile(&profile_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn has_profiles() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        store.has_profiles().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_profile_count() -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(|e| e.to_string())?;
        store.profile_count().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// =============================================================================
// Security
// =============================================================================

#[tauri::command]
pub fn check_file_exists(path: String) -> bool {
    desktop_runtime::security::check_file_exists(&path)
}

#[tauri::command]
pub async fn encrypt_and_save(
    _app: AppHandle,
    profile_id: String,
    provider: String,
    plaintext: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        desktop_runtime::security::encrypt_and_save(&profile_id, &provider, &plaintext)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn set_agreed_flag(_app: AppHandle) -> Result<(), String> {
    desktop_runtime::security::set_agreed_flag()
}

#[tauri::command]
pub fn has_agreed_flag(_app: AppHandle) -> bool {
    desktop_runtime::security::has_agreed_flag()
}
