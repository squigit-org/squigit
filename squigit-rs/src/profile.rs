// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Profile authentication shared by every Squigit shell.

use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, MutexGuard, OnceLock, RwLock,
};
use std::time::Instant;

use squigit_auth::auth::{
    begin_google_auth_flow, complete_google_auth_flow, google_auth_status_page_url_for,
    hydrate_avatar, AuthFlowSettings, LoopbackAuthPage, LoopbackAuthServer,
};
use squigit_auth::CredentialsSource;
use squigit_storage::{Profile, ProfileSnapshot, ProfileStore};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, ProfileError>;

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("Authentication is already in progress")]
    AuthenticationInProgress,

    #[error("Authentication cancelled")]
    AuthenticationCancelled,

    #[error("Authentication timed out")]
    AuthenticationTimedOut,

    #[error("The active profile cannot be deleted")]
    ActiveProfileDeletion,

    #[error("Authentication task failed: {0}")]
    AuthenticationTask(String),

    #[error(transparent)]
    Auth(#[from] squigit_auth::ProfileError),

    #[error(transparent)]
    Storage(#[from] squigit_storage::StorageError),
}

impl ProfileError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::AuthenticationInProgress => "authentication-in-progress",
            Self::AuthenticationCancelled => "authentication-cancelled",
            Self::AuthenticationTimedOut => "authentication-timed-out",
            Self::ActiveProfileDeletion => "active-profile-deletion",
            Self::AuthenticationTask(_) => "authentication-task-failed",
            Self::Auth(_) => "authentication-failed",
            Self::Storage(_) => "profile-storage-failed",
        }
    }
}

struct PendingGoogleAuth {
    cancelled: Arc<AtomicBool>,
}

static PENDING_GOOGLE_AUTH: Mutex<Option<PendingGoogleAuth>> = Mutex::new(None);
static AVATAR_HYDRATIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn pending_google_auth() -> Result<MutexGuard<'static, Option<PendingGoogleAuth>>> {
    PENDING_GOOGLE_AUTH
        .lock()
        .map_err(|_| ProfileError::AuthenticationTask("authentication state is poisoned".into()))
}

fn avatar_hydrations() -> &'static Mutex<HashSet<String>> {
    AVATAR_HYDRATIONS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn profile_snapshot(store: &ProfileStore) -> Result<ProfileSnapshot> {
    let snapshot = store.profile_snapshot()?;
    hydrate_missing_avatars(&snapshot);
    Ok(snapshot)
}

/// Read the complete profile state in one operation.
///
/// `active_profile == None` is Guest mode. Missing avatars are hydrated in the
/// background and never delay this response.
pub fn get_profile_snapshot() -> Result<ProfileSnapshot> {
    let store = ProfileStore::new()?;
    profile_snapshot(&store)
}

/// Begin Google OAuth and return the canonical state after a successful login.
pub async fn start_google_auth() -> Result<ProfileSnapshot> {
    tokio::task::spawn_blocking(start_google_auth_blocking)
        .await
        .map_err(|error| ProfileError::AuthenticationTask(error.to_string()))?
}

fn start_google_auth_blocking() -> Result<ProfileSnapshot> {
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut pending = pending_google_auth()?;
        if pending.is_some() {
            return Err(ProfileError::AuthenticationInProgress);
        }
        *pending = Some(PendingGoogleAuth {
            cancelled: cancelled.clone(),
        });
    }

    let result = run_google_auth(cancelled.clone());
    clear_pending_google_auth(&cancelled);
    result
}

fn run_google_auth(cancelled: Arc<AtomicBool>) -> Result<ProfileSnapshot> {
    let loopback = LoopbackAuthServer::bind()?;
    let mut settings = google_auth_settings();
    settings.redirect_uri = loopback.redirect_uri().to_string();
    let attempt = begin_google_auth_flow(&settings)?;
    let auth_url = attempt.auth_url().to_string();

    (settings.open_browser)(&auth_url)?;

    let started_at = Instant::now();
    let callback = loop {
        if cancelled.load(Ordering::SeqCst) {
            return Err(ProfileError::AuthenticationCancelled);
        }
        if started_at.elapsed() > settings.timeout {
            return Err(ProfileError::AuthenticationTimedOut);
        }
        if let Some(callback) = loopback.recv_timeout()? {
            break callback;
        }
    };

    if cancelled.load(Ordering::SeqCst) {
        let status_url =
            google_auth_status_page_url_for(&settings.status_page_url, LoopbackAuthPage::Invalid);
        let _ = callback.redirect(&status_url);
        return Err(ProfileError::AuthenticationCancelled);
    }

    let store = ProfileStore::new()?;
    let result = complete_google_auth_flow(&store, &settings, attempt, callback.callback_url());
    let page = if result.is_ok() {
        LoopbackAuthPage::Success
    } else {
        LoopbackAuthPage::Invalid
    };
    let status_url = google_auth_status_page_url_for(&settings.status_page_url, page);
    if let Err(error) = callback.redirect(&status_url) {
        eprintln!("[profile] Failed to redirect the Google auth response: {error}");
    }

    result?;
    store.invalidate_last_trusted_reveal()?;
    profile_snapshot(&store)
}

static CONFIGURED_GOOGLE_CREDENTIALS: RwLock<Option<CredentialsSource>> = RwLock::new(None);

/// Provide Google OAuth credentials to the profile authentication engine.
///
/// This is typically called at application startup by the host environment
/// (e.g. `squigit-runtime` secrets).
pub fn set_google_credentials(source: CredentialsSource) {
    if let Ok(mut lock) = CONFIGURED_GOOGLE_CREDENTIALS.write() {
        *lock = Some(source);
    }
}

/// Convenience method to configure Google OAuth credentials from a raw JSON string.
pub fn set_google_credentials_json(json: impl Into<String>) {
    set_google_credentials(CredentialsSource::RawJson(json.into()));
}

/// Retrieve the currently configured credentials source, if any.
pub fn configured_google_credentials() -> Option<CredentialsSource> {
    CONFIGURED_GOOGLE_CREDENTIALS
        .read()
        .ok()
        .and_then(|guard| guard.clone())
}

/// Check if Google authentication is configured and valid.
pub fn is_google_auth_configured() -> bool {
    let settings = google_auth_settings();
    squigit_auth::auth::validate_google_credentials(&settings).is_ok()
}

fn google_auth_settings() -> AuthFlowSettings {
    let mut settings = AuthFlowSettings::new(Arc::new(|url| {
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(url)
                .env_remove("LD_LIBRARY_PATH")
                .env_remove("ELECTRON_RUN_AS_NODE")
                .env_remove("GIO_EXTRA_MODULES")
                .spawn()
                .map(|_| ())
                .map_err(|error| {
                    squigit_auth::ProfileError::Auth(format!(
                        "Could not open Google authentication: {error}"
                    ))
                })
        }
        #[cfg(not(target_os = "linux"))]
        {
            webbrowser::open(url).map(|_| ()).map_err(|error| {
                squigit_auth::ProfileError::Auth(format!(
                    "Could not open Google authentication: {error}"
                ))
            })
        }
    }));
    if let Some(source) = configured_google_credentials() {
        settings.credentials_source = source;
    }
    settings
}

fn clear_pending_google_auth(cancelled: &Arc<AtomicBool>) {
    let Ok(mut pending) = PENDING_GOOGLE_AUTH.lock() else {
        return;
    };
    if pending
        .as_ref()
        .is_some_and(|current| Arc::ptr_eq(&current.cancelled, cancelled))
    {
        *pending = None;
    }
}

/// Cancel the currently pending Google OAuth flow.
pub fn cancel_google_auth() -> Result<()> {
    if let Some(pending) = pending_google_auth()?.take() {
        pending.cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// Delete an inactive profile and return the canonical state.
pub fn delete_profile(profile_id: &str) -> Result<ProfileSnapshot> {
    let store = ProfileStore::new()?;
    if store.get_active_profile_id()?.as_deref() == Some(profile_id) {
        return Err(ProfileError::ActiveProfileDeletion);
    }
    store.delete_profile(profile_id)?;
    store.invalidate_last_trusted_reveal()?;
    profile_snapshot(&store)
}

/// Activate a stored profile and return the canonical state.
pub fn switch_profile(profile_id: &str) -> Result<ProfileSnapshot> {
    let store = ProfileStore::new()?;
    store.set_active_profile_id(profile_id)?;
    store.invalidate_last_trusted_reveal()?;
    profile_snapshot(&store)
}

/// Enter Guest mode while keeping saved profiles available for later use.
pub fn logout() -> Result<ProfileSnapshot> {
    let store = ProfileStore::new()?;
    if store.get_active_profile_id()?.is_some() {
        store.clear_active_profile_id()?;
        store.invalidate_last_trusted_reveal()?;
    }
    profile_snapshot(&store)
}

fn hydrate_missing_avatars(snapshot: &ProfileSnapshot) {
    for profile in &snapshot.profiles {
        schedule_avatar_hydration(profile);
    }
}

fn schedule_avatar_hydration(profile: &Profile) {
    if profile
        .avatar_base64
        .as_deref()
        .is_some_and(|avatar| !avatar.trim().is_empty())
    {
        return;
    }
    let Some(url) = profile
        .avatar_url
        .as_deref()
        .filter(|url| !url.trim().is_empty())
    else {
        return;
    };

    let profile_id = profile.id.clone();
    let url = url.to_string();
    let hydration_key = format!("{profile_id}\0{url}");
    {
        let Ok(mut hydrations) = avatar_hydrations().lock() else {
            return;
        };
        if !hydrations.insert(hydration_key.clone()) {
            return;
        }
    }

    let thread_key = hydration_key.clone();
    let spawn_result = std::thread::Builder::new()
        .name(format!("profile-avatar-{}", profile_id))
        .spawn(move || {
            match ProfileStore::new() {
                Ok(store) => {
                    if let Err(error) = hydrate_avatar(&store, &url, Some(&profile_id)) {
                        eprintln!("[profile] Avatar hydration stopped: {error}");
                    }
                }
                Err(error) => eprintln!("[profile] Could not open avatar storage: {error}"),
            }
            if let Ok(mut hydrations) = avatar_hydrations().lock() {
                hydrations.remove(&thread_key);
            }
        });

    if let Err(error) = spawn_result {
        if let Ok(mut hydrations) = avatar_hydrations().lock() {
            hydrations.remove(&hydration_key);
        }
        eprintln!("[profile] Could not start avatar hydration: {error}");
    }
}
