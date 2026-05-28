// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::str::FromStr;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use napi::{Error, Result};
use napi_derive::napi;
use ops_profile_store::auth::{start_google_auth_flow, AuthFlowSettings, CredentialsSource};
use ops_profile_store::security::{get_decrypted_key, encrypt_and_save_key, ApiKeyProvider};
use ops_profile_store::ProfileStore;

use crate::types::{NapiAuthResult, NapiProfile};

fn map_profile_err(err: ops_profile_store::error::ProfileError) -> Error {
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
    store.set_active_profile_id(&profile_id).map_err(map_profile_err)
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
    store.profile_count().map_err(map_profile_err).map(|count| count as u32)
}

#[napi]
pub fn start_google_auth() -> Result<NapiAuthResult> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    
    // We let the auth flow handle credentials resolution (via SQUIGIT_GOOGLE_CREDENTIALS_JSON etc)
    let mut settings = AuthFlowSettings::new(
        "Squigit",
        Arc::new(|url| {
            webbrowser::open(url).map_err(|e| ops_profile_store::error::ProfileError::Auth(e.to_string()))?;
            Ok(())
        })
    );
    settings.redirect_port = 6062;

    let auth_cancelled = Arc::new(AtomicBool::new(false));

    let result = start_google_auth_flow(&store, &settings, auth_cancelled).map_err(map_profile_err)?;
    
    Ok(NapiAuthResult {
        id: result.id,
        name: result.name,
        email: result.email,
        avatar: result.avatar,
        original_picture: result.original_picture,
    })
}

#[napi]
pub fn save_api_key(profile_id: String, provider: String, key: String) -> Result<String> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let provider_enum = ApiKeyProvider::from_str(&provider).map_err(|e| Error::from_reason(e.to_string()))?;
    encrypt_and_save_key(&store, &profile_id, provider_enum, &key).map_err(map_profile_err)?;
    Ok(key)
}

#[napi]
pub fn get_api_key(profile_id: String, provider: String) -> Result<Option<String>> {
    let store = ProfileStore::new().map_err(map_profile_err)?;
    let provider_enum = ApiKeyProvider::from_str(&provider).map_err(|e| Error::from_reason(e.to_string()))?;
    get_decrypted_key(&store, provider_enum, &profile_id).map_err(map_profile_err)
}

#[napi]
pub fn validate_auth_credentials() -> Result<()> {
    let settings = AuthFlowSettings::new(
        "Squigit",
        Arc::new(|_| Ok(()))
    );
    ops_profile_store::auth::validate_google_credentials(&settings).map_err(map_profile_err)
}
