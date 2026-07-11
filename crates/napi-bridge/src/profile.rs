// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use squigit_auth::auth::{hydrate_avatar as hydrate_profile_avatar, start_google_auth_flow, AuthFlowSettings};
use squigit_auth::security::{encrypt_and_save_key, get_decrypted_key, ApiKeyProvider};
use squigit_auth::ProfileStore;
use std::str::FromStr;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

use crate::types::{NapiAuthResult, NapiProfile};

static ACTIVE_AUTH_CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

fn map_profile_err(err: squigit_auth::error::ProfileError) -> Error {
    Error::from_reason(err.to_string())
}

#[napi]
pub fn get_store_base_dir() -> Result<String> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    Ok(store.base_dir().to_string_lossy().to_string())
}

#[napi]
pub fn get_active_profile_id() -> Result<Option<String>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.get_active_profile_id().map_err(map_profile_err)
}

#[napi]
pub fn set_active_profile(profile_id: String) -> Result<()> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store
        .set_active_profile_id(&profile_id)
        .map_err(map_profile_err)
}

#[napi]
pub fn clear_active_profile() -> Result<()> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.clear_active_profile_id().map_err(map_profile_err)
}

#[napi]
pub fn list_profiles() -> Result<Vec<NapiProfile>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let profiles = store.list_profiles().map_err(map_profile_err)?;
    Ok(profiles.into_iter().map(Into::into).collect())
}

#[napi]
pub fn get_profile(profile_id: String) -> Result<Option<NapiProfile>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let profile = store.get_profile(&profile_id).map_err(map_profile_err)?;
    Ok(profile.map(Into::into))
}

#[napi]
pub fn find_profile_by_email(email: String) -> Result<Option<NapiProfile>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let profiles = store.list_profiles().map_err(map_profile_err)?;
    let profile = profiles.into_iter().find(|p| p.email == email);
    Ok(profile.map(Into::into))
}

#[napi]
pub fn delete_profile(profile_id: String) -> Result<()> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.delete_profile(&profile_id).map_err(map_profile_err)
}

#[napi]
pub fn has_profiles() -> Result<bool> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store.has_profiles().map_err(map_profile_err)
}

#[napi]
pub fn profile_count() -> Result<u32> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    store
        .profile_count()
        .map_err(map_profile_err)
        .map(|count| count as u32)
}

#[napi]
pub async fn start_google_auth() -> Result<NapiAuthResult> {
    tokio::task::spawn_blocking(|| {
        let store = ProfileStore::new().map_err(map_profile_err)?;

        // We let the auth flow handle credentials resolution (via SQUIGIT_GOOGLE_CREDENTIALS_JSON etc)
        let mut settings = AuthFlowSettings::new(
            Arc::new(|url| {
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
            }),
        );
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

#[napi]
pub async fn hydrate_avatar(url: String, profile_id: Option<String>) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let store = ProfileStore::new().map_err(map_profile_err)?;
        hydrate_profile_avatar(&store, &url, profile_id.as_deref()).map_err(map_profile_err)
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))?
}

#[napi]
pub fn cancel_google_auth() -> Result<()> {
    let mut lock = ACTIVE_AUTH_CANCEL.lock().unwrap();
    if let Some(flag) = lock.take() {
        flag.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(())
}

#[napi]
pub fn save_api_key(profile_id: String, provider: String, key: String) -> Result<String> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let provider_enum =
        ApiKeyProvider::from_str(&provider).map_err(|e| Error::from_reason(e.to_string()))?;
    encrypt_and_save_key(&store, &profile_id, provider_enum, &key).map_err(map_profile_err)?;
    Ok(key)
}

#[napi]
pub fn get_api_key(profile_id: String, provider: String) -> Result<Option<String>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let provider_enum =
        ApiKeyProvider::from_str(&provider).map_err(|e| Error::from_reason(e.to_string()))?;
    get_decrypted_key(&store, provider_enum, &profile_id).map_err(map_profile_err)
}

#[napi]
pub fn validate_auth_credentials() -> Result<()> {
    let settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
    squigit_auth::auth::validate_google_credentials(&settings).map_err(map_profile_err)
}
