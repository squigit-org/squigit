// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use squigit_auth::auth::{
    begin_google_auth_flow, complete_google_auth_flow, google_auth_callback_state,
    hydrate_avatar as hydrate_profile_avatar, AuthFlowSettings, AuthSuccessData, GoogleAuthAttempt,
};
use squigit_auth::security::{
    encrypt_and_save_api_key as ensak, get_decrypted_key, ApiKeyProvider,
};
use squigit_auth::ProfileStore;
use std::str::FromStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::{Duration, Instant};

use crate::types::{NapiAuthResult, NapiProfile, NapiProfileSnapshot};

const CALLBACK_COMPLETION_TIMEOUT: Duration = Duration::from_secs(60 * 60);

type AuthCompletion = std::result::Result<AuthSuccessData, String>;

enum AuthSignal {
    CallbackAccepted,
    Completed(AuthCompletion),
    Cancelled,
}

struct PendingGoogleAuth {
    state: String,
    settings: AuthFlowSettings,
    attempt: GoogleAuthAttempt,
    sender: mpsc::Sender<AuthSignal>,
    cancelled: Arc<AtomicBool>,
}

static ACTIVE_GOOGLE_AUTH: Mutex<Option<PendingGoogleAuth>> = Mutex::new(None);

fn map_profile_err(err: squigit_auth::error::ProfileError) -> Error {
    Error::from_reason(err.to_string())
}

fn auth_success_to_napi(result: AuthSuccessData) -> NapiAuthResult {
    NapiAuthResult {
        id: result.id,
        name: result.name,
        email: result.email,
        avatar_base64: result.avatar_base64,
        avatar_url: result.avatar_url,
    }
}

fn google_auth_settings() -> AuthFlowSettings {
    AuthFlowSettings::new(Arc::new(|url| {
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
    }))
}

fn cancel_pending_auth(pending: PendingGoogleAuth) {
    pending.cancelled.store(true, Ordering::SeqCst);
    let _ = pending.sender.send(AuthSignal::Cancelled);
}

fn clear_pending_auth_if_state(state: &str) {
    let mut lock = ACTIVE_GOOGLE_AUTH.lock().unwrap();
    let should_clear = lock
        .as_ref()
        .is_some_and(|pending| pending.state.as_str() == state);
    if should_clear {
        if let Some(pending) = lock.take() {
            cancel_pending_auth(pending);
        }
    }
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
        let settings = google_auth_settings();
        let attempt = begin_google_auth_flow(&settings).map_err(map_profile_err)?;
        let auth_url = attempt.auth_url().to_string();
        let state = attempt.state().to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        let (sender, receiver) = mpsc::channel();

        {
            let mut lock = ACTIVE_GOOGLE_AUTH.lock().unwrap();
            if let Some(pending) = lock.take() {
                cancel_pending_auth(pending);
            }
            *lock = Some(PendingGoogleAuth {
                state: state.clone(),
                settings: settings.clone(),
                attempt,
                sender,
                cancelled: cancelled.clone(),
            });
        }

        if let Err(err) = (settings.open_browser)(&auth_url) {
            clear_pending_auth_if_state(&state);
            return Err(map_profile_err(err));
        }

        let started_at = Instant::now();
        let mut callback_started_at: Option<Instant> = None;
        loop {
            if cancelled.load(Ordering::SeqCst) {
                return Err(Error::from_reason("Authentication cancelled".to_string()));
            }

            if callback_started_at.is_none() && started_at.elapsed() > settings.timeout {
                clear_pending_auth_if_state(&state);
                return Err(Error::from_reason("Authentication timed out".to_string()));
            }

            if let Some(callback_started_at) = callback_started_at {
                if callback_started_at.elapsed() > CALLBACK_COMPLETION_TIMEOUT {
                    return Err(Error::from_reason(
                        "Authentication callback timed out".to_string(),
                    ));
                }
            }

            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(AuthSignal::CallbackAccepted) => {
                    callback_started_at = Some(Instant::now());
                }
                Ok(AuthSignal::Completed(Ok(result))) => return Ok(auth_success_to_napi(result)),
                Ok(AuthSignal::Completed(Err(reason))) => return Err(Error::from_reason(reason)),
                Ok(AuthSignal::Cancelled) => {
                    return Err(Error::from_reason("Authentication cancelled".to_string()))
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(Error::from_reason("Authentication cancelled".to_string()))
                }
            }
        }
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))?
}

#[napi(js_name = "complete_google_auth_callback")]
pub async fn complete_google_auth_callback(callback_url: String) -> Result<NapiAuthResult> {
    tokio::task::spawn_blocking(move || {
        let pending = {
            let mut lock = ACTIVE_GOOGLE_AUTH.lock().unwrap();
            let pending = lock.as_ref().ok_or_else(|| {
                Error::from_reason("No active Google authentication attempt".to_string())
            })?;
            let callback_state =
                google_auth_callback_state(&callback_url, &pending.settings.redirect_uri)
                    .map_err(map_profile_err)?;
            if callback_state != pending.state {
                return Err(Error::from_reason(
                    "OAuth callback state mismatch".to_string(),
                ));
            }
            lock.take().ok_or_else(|| {
                Error::from_reason("No active Google authentication attempt".to_string())
            })?
        };

        let _ = pending.sender.send(AuthSignal::CallbackAccepted);
        let store = ProfileStore::new().map_err(map_profile_err)?;
        let result =
            complete_google_auth_flow(&store, &pending.settings, pending.attempt, &callback_url)
                .map_err(|err| err.to_string());
        let _ = pending.sender.send(AuthSignal::Completed(result.clone()));

        match result {
            Ok(result) => Ok(auth_success_to_napi(result)),
            Err(reason) => Err(Error::from_reason(reason)),
        }
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
    let mut lock = ACTIVE_GOOGLE_AUTH.lock().unwrap();
    if let Some(pending) = lock.take() {
        cancel_pending_auth(pending);
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
