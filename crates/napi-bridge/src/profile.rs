// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use squigit_auth::auth::{
    hydrate_avatar as hydrate_profile_avatar, start_google_auth_flow, AuthFlowSettings,
};
use squigit_auth::security::{
    encrypt_and_save_api_key as ensak, get_decrypted_key, ApiKeyProvider,
};
use squigit_auth::ProfileStore;
use std::str::FromStr;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

use crate::types::{NapiAuthResult, NapiProfile, NapiProfileSnapshot};

static ACTIVE_AUTH_CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn map_profile_err(err: squigit_auth::error::ProfileError) -> Error {
    Error::from_reason(err.to_string())
}

#[napi(js_name = "get_store_base_dir")]
pub fn get_store_base_dir() -> Result<String> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    Ok(store.base_dir().to_string_lossy().to_string())
}

#[napi(js_name = "get_active_profile_id")]
pub fn get_active_profile_id() -> Result<Option<String>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.get_active_profile_id().map_err(map_profile_err)
}

#[napi(js_name = "set_active_profile")]
pub fn set_active_profile(profile_id: String) -> Result<()> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store
        .set_active_profile_id(&profile_id)
        .map_err(map_profile_err)
}

#[napi(js_name = "clear_active_profile")]
pub fn clear_active_profile() -> Result<()> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.clear_active_profile_id().map_err(map_profile_err)
}

#[napi(js_name = "list_profiles")]
pub fn list_profiles() -> Result<Vec<NapiProfile>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let profiles = store.list_profiles().map_err(map_profile_err)?;
    Ok(profiles.into_iter().map(Into::into).collect())
}

#[napi(js_name = "get_profile_snapshot")]
pub fn get_profile_snapshot() -> Result<NapiProfileSnapshot> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let snapshot = store.profile_snapshot().map_err(map_profile_err)?;
    Ok(snapshot.into())
}

#[napi(js_name = "get_profile")]
pub fn get_profile(profile_id: String) -> Result<Option<NapiProfile>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let profile = store.get_profile(&profile_id).map_err(map_profile_err)?;
    Ok(profile.map(Into::into))
}

#[napi(js_name = "get_active_profile")]
pub fn get_active_profile() -> Result<Option<NapiProfile>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let profile = store.get_active_profile().map_err(map_profile_err)?;
    Ok(profile.map(Into::into))
}

#[napi(js_name = "delete_profile")]
pub fn delete_profile(profile_id: String) -> Result<()> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.delete_profile(&profile_id).map_err(map_profile_err)
}

#[napi(js_name = "has_profiles")]
pub fn has_profiles() -> Result<bool> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.has_profiles().map_err(map_profile_err)
}

#[napi(js_name = "profile_count")]
pub fn profile_count() -> Result<u32> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store
        .profile_count()
        .map_err(map_profile_err)
        .map(|count| count as u32)
}

#[napi(js_name = "start_google_auth")]
pub async fn start_google_auth() -> Result<NapiAuthResult> {
    tokio::task::spawn_blocking(|| {
        let store = ProfileStore::new().map_err(map_profile_err)?;

        // We let the auth flow handle credentials resolution (via SQUIGIT_GOOGLE_CREDENTIALS_JSON etc)
        let mut settings = AuthFlowSettings::new(Arc::new(|url| {
            #[cfg(target_os = "linux")]
            {
                let _ = std::process::Command::new("xdg-open")
                    .arg(url)
                    .env_remove("LD_LIBRARY_PATH")
                    .env_remove("ELECTRON_RUN_AS_NODE")
                    .env_remove("GIO_EXTRA_MODULES")
                    .spawn();
            }
            #[cfg(not(target_os = "linux"))]
            {
                let _ = webbrowser::open(url);
            }
            Ok(())
        }));
        settings.redirect_port = 6062;

        let auth_cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut lock = ACTIVE_AUTH_CANCEL.lock().unwrap();
            *lock = Some(auth_cancelled.clone());
        }

        let result =
            start_google_auth_flow(&store, &settings, auth_cancelled).map_err(map_profile_err)?;

        Ok(NapiAuthResult {
            id: result.id,
            name: result.name,
            email: result.email,
            avatar_base64: result.avatar_base64,
            avatar_url: result.avatar_url,
        })
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))?
}

#[napi(js_name = "hydrate_avatar")]
pub async fn hydrate_avatar(url: String, profile_id: Option<String>) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(map_profile_err)?;
        hydrate_profile_avatar(&store, &url, profile_id.as_deref()).map_err(map_profile_err)
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))?
}

#[napi(js_name = "cancel_google_auth")]
pub fn cancel_google_auth() -> Result<()> {
    let mut lock = ACTIVE_AUTH_CANCEL.lock().unwrap();
    if let Some(flag) = lock.take() {
        flag.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(())
}

#[napi(js_name = "encrypt_and_save_api_key")]
pub fn encrypt_and_save_api_key(
    profile_id: String,
    provider: String,
    key: String,
) -> Result<String> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let provider_enum =
        ApiKeyProvider::from_str(&provider).map_err(|e| Error::from_reason(e.to_string()))?;
    ensak(&store, &profile_id, provider_enum, &key).map_err(map_profile_err)?;
    Ok(key)
}

#[napi(js_name = "get_api_key")]
pub fn get_api_key(profile_id: String, provider: String) -> Result<Option<String>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let provider_enum =
        ApiKeyProvider::from_str(&provider).map_err(|e| Error::from_reason(e.to_string()))?;
    get_decrypted_key(&store, provider_enum, &profile_id).map_err(map_profile_err)
}
