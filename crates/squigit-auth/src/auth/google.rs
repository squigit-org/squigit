// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose, Engine as _};
use image::ImageFormat;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Response, Server, StatusCode};
use url::Url;

use crate::{Profile, ProfileError, ProfileStore, Result};

use super::callback_server::CANCELLED_CALLBACK_GRACE;
use super::credentials::load_google_oauth_config;
use super::templates::{respond_failure, respond_success, FAVICON_BYTES};
use super::{AuthAccountPolicy, AuthFlowSettings};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthSuccessData {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_base64: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct UserProfile {
    names: Option<Vec<Name>>,
    #[serde(rename = "emailAddresses")]
    email_addresses: Option<Vec<Email>>,
    photos: Option<Vec<Photo>>,
}

#[derive(Deserialize)]
struct Name {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct Email {
    value: Option<String>,
}

#[derive(Deserialize)]
struct Photo {
    url: Option<String>,
}

fn generate_state_token() -> String {
    use rand::{rngs::OsRng, RngCore};

    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn avatar_target_id(store: &ProfileStore, profile_id: Option<&str>) -> Result<String> {
    match profile_id {
        Some(id) => Ok(id.to_string()),
        None => store.get_active_profile_id()?.ok_or_else(|| {
            ProfileError::Auth("No active profile and no profile ID provided.".to_string())
        }),
    }
}

fn avatar_temp_path(profile_id: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    std::env::temp_dir().join(format!("squigit-avatar-{}-{}.download", profile_id, nonce))
}

fn download_avatar_data_url(client: &Client, url: &str, profile_id: &str) -> Result<String> {
    if url.trim().is_empty() {
        return Err(ProfileError::Auth("Avatar URL is empty.".to_string()));
    }

    let response = client.get(url).send()?;
    if !response.status().is_success() {
        return Err(ProfileError::Auth(format!(
            "Failed to download avatar: HTTP {}",
            response.status()
        )));
    }

    let bytes = response.bytes()?;
    if bytes.is_empty() {
        return Err(ProfileError::Auth("Downloaded avatar is empty.".to_string()));
    }

    let temp_path = avatar_temp_path(profile_id);
    fs::write(&temp_path, bytes.as_ref())?;

    let image = image::load_from_memory(bytes.as_ref());
    let _ = fs::remove_file(&temp_path);
    let image = image
        .map_err(|err| ProfileError::Auth(format!("Failed to decode avatar image: {}", err)))?;

    let mut cursor = Cursor::new(Vec::new());
    image
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|err| ProfileError::Auth(format!("Failed to encode avatar as PNG: {}", err)))?;
    let encoded = general_purpose::STANDARD.encode(cursor.into_inner());

    Ok(format!("data:image/png;base64,{}", encoded))
}

fn hydrate_avatar_once(store: &ProfileStore, url: &str, profile_id: &str) -> Result<String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let avatar_base64 = download_avatar_data_url(&client, url, profile_id)?;

    let mut profile = store
        .get_profile(profile_id)?
        .ok_or_else(|| ProfileError::ProfileNotFound(profile_id.to_string()))?;
    profile.avatar_base64 = Some(avatar_base64.clone());
    profile.avatar_url = Some(url.to_string());
    store.upsert_profile(&profile)?;

    Ok(avatar_base64)
}

fn should_retry_avatar_hydration(err: &ProfileError) -> bool {
    matches!(
        err,
        ProfileError::Auth(_) | ProfileError::Io(_) | ProfileError::Network(_)
    )
}

pub fn hydrate_avatar(store: &ProfileStore, url: &str, profile_id: Option<&str>) -> Result<String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(ProfileError::Auth("Avatar URL is empty.".to_string()));
    }

    let target_id = match profile_id {
        Some(id) => id.to_string(),
        None => avatar_target_id(store, None)?,
    };
    let retry_delays = [1, 2, 4, 8, 16, 30, 60];
    let mut attempt = 0usize;

    loop {
        match hydrate_avatar_once(store, url, &target_id) {
            Ok(avatar_base64) => return Ok(avatar_base64),
            Err(err) if should_retry_avatar_hydration(&err) => {
                let delay = retry_delays
                    .get(attempt)
                    .copied()
                    .unwrap_or(60);
                attempt = attempt.saturating_add(1);
                eprintln!(
                    "[auth] Avatar hydration failed for profile {}: {}. Retrying in {}s.",
                    target_id, err, delay
                );
                thread::sleep(Duration::from_secs(delay));
            }
            Err(err) => return Err(err),
        }
    }
}

pub fn start_google_auth_flow(
    store: &ProfileStore,
    settings: &AuthFlowSettings,
    auth_cancelled: Arc<AtomicBool>,
) -> Result<AuthSuccessData> {
    let secrets = load_google_oauth_config(settings)?;
    let bind_addr = format!("{}:{}", settings.redirect_host, settings.redirect_port);
    let server = Server::http(&bind_addr).map_err(|err| {
        ProfileError::Auth(format!(
            "Failed to start auth server on {}: {}",
            bind_addr, err
        ))
    })?;

    let expected_state = generate_state_token();
    let redirect_uri = settings.redirect_uri();

    let mut auth_url = Url::parse(&secrets.auth_uri)?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &secrets.client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "profile email")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "select_account consent")
        .append_pair("state", &expected_state);

    (settings.open_browser)(auth_url.as_str())?;

    let started_at = Instant::now();
    let mut cancelled_callback_deadline: Option<Instant> = None;
    loop {
        if auth_cancelled.load(Ordering::SeqCst) && cancelled_callback_deadline.is_none() {
            cancelled_callback_deadline = Some(Instant::now() + CANCELLED_CALLBACK_GRACE);
        }

        if let Some(deadline) = cancelled_callback_deadline {
            if Instant::now() >= deadline {
                return Err(ProfileError::Auth("Authentication cancelled".to_string()));
            }
        }

        if started_at.elapsed() > settings.timeout {
            return Err(ProfileError::Auth("Authentication timed out".to_string()));
        }

        let request = match server.recv_timeout(Duration::from_millis(250)) {
            Ok(Some(request)) => request,
            Ok(None) => continue,
            Err(err) => {
                return Err(ProfileError::Auth(format!(
                    "Failed waiting for OAuth callback: {}",
                    err
                )))
            }
        };

        let request_url = request.url().to_string();
        if request_url == "/favicon.ico" || request_url == "/favicon.png" {
            let response = Response::from_data(FAVICON_BYTES.to_vec())
                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"image/png"[..]).unwrap());
            let _ = request.respond(response);
            continue;
        }

        if request_url == settings.cancel_path() {
            cancelled_callback_deadline = Some(Instant::now() + CANCELLED_CALLBACK_GRACE);
            let _ = request.respond(Response::empty(StatusCode(200)));
            continue;
        }

        if auth_cancelled.load(Ordering::SeqCst) || started_at.elapsed() > settings.timeout {
            let _ = respond_failure(
                request,
                "Authentication Expired",
                "<p>The authentication request has expired or was cancelled.</p><p>Please close this tab and try again from Squigit.</p>",
            );
            return Err(ProfileError::Auth("Authentication expired".to_string()));
        }

        let callback_url = format!("{}{}", redirect_uri, request_url);
        let url = match Url::parse(&callback_url) {
            Ok(url) => url,
            Err(err) => {
                let _ = respond_failure(
                    request,
                    "Authentication Failed",
                    "<p>The OAuth callback URL was invalid.</p><p>Please close this tab and try again.</p>",
                );
                return Err(ProfileError::Auth(format!(
                    "Failed to parse OAuth callback URL: {}",
                    err
                )));
            }
        };

        if let Some((_, error_code)) = url.query_pairs().find(|(key, _)| key == "error") {
            let message = format!("<p>Google returned an error while signing in: <strong>{}</strong>.</p><p>Please close this tab and try again.</p>", error_code);
            let _ = respond_failure(request, "Authentication Failed", &message);
            return Err(ProfileError::Auth(format!(
                "Google sign-in returned an error: {}",
                error_code
            )));
        }

        let returned_state = url
            .query_pairs()
            .find(|(key, _)| key == "state")
            .map(|(_, value)| value.into_owned());
        if returned_state.as_deref() != Some(expected_state.as_str()) {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>The OAuth callback state was invalid. This request may be stale or tampered with.</p><p>Please close this tab and try again.</p>",
            );
            return Err(ProfileError::Auth(
                "OAuth callback state mismatch".to_string(),
            ));
        }

        let Some((_, code)) = url.query_pairs().find(|(key, _)| key == "code") else {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>No authorization code was returned by Google.</p><p>Please close this tab and try again.</p>",
            );
            return Err(ProfileError::Auth(
                "No authorization code found in callback".to_string(),
            ));
        };

        let client = Client::new();
        let token_res = match client
            .post(&secrets.token_uri)
            .form(&[
                ("client_id", secrets.client_id.clone()),
                ("client_secret", secrets.client_secret.clone()),
                ("code", code.to_string()),
                ("grant_type", "authorization_code".to_string()),
                ("redirect_uri", redirect_uri.clone()),
            ])
            .send()
        {
            Ok(response) => response,
            Err(err) => {
                let _ = respond_failure(
                    request,
                    "Authentication Failed",
                    "<p>Token exchange with Google failed.</p><p>Please close this tab and try again.</p>",
                );
                return Err(ProfileError::Auth(format!(
                    "Token exchange failed: {}",
                    err
                )));
            }
        };

        if !token_res.status().is_success() {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>Google refused the authorization code exchange.</p><p>Please close this tab and try again.</p>",
            );
            return Err(ProfileError::Auth(format!(
                "Google refused token exchange: HTTP {}",
                token_res.status()
            )));
        }

        let token_data: TokenResponse = match token_res.json() {
            Ok(token_data) => token_data,
            Err(err) => {
                let _ = respond_failure(
                    request,
                    "Authentication Failed",
                    "<p>Google returned an unexpected token response.</p><p>Please close this tab and try again.</p>",
                );
                return Err(ProfileError::Auth(format!(
                    "Failed to decode Google token response: {}",
                    err
                )));
            }
        };

        let profile_res = match client
            .get(&settings.user_info_url)
            .bearer_auth(&token_data.access_token)
            .send()
        {
            Ok(profile_res) => profile_res,
            Err(err) => {
                let _ = respond_failure(
                    request,
                    "Authentication Failed",
                    "<p>Google profile lookup failed.</p><p>Please close this tab and try again.</p>",
                );
                return Err(ProfileError::Auth(format!("Profile fetch failed: {}", err)));
            }
        };

        if !profile_res.status().is_success() {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>Google profile lookup failed.</p><p>Please close this tab and try again.</p>",
            );
            return Err(ProfileError::Auth(format!(
                "Google profile lookup failed: HTTP {}",
                profile_res.status()
            )));
        }

        let profile: UserProfile = match profile_res.json() {
            Ok(profile) => profile,
            Err(err) => {
                let _ = respond_failure(
                    request,
                    "Authentication Failed",
                    "<p>Google returned an unexpected profile response.</p><p>Please close this tab and try again.</p>",
                );
                return Err(ProfileError::Auth(format!(
                    "Failed to decode Google profile response: {}",
                    err
                )));
            }
        };

        let name = profile
            .names
            .and_then(|items| items.first().and_then(|item| item.display_name.clone()))
            .unwrap_or_else(|| "Squigit User".to_string());
        let email = profile
            .email_addresses
            .and_then(|items| items.first().and_then(|item| item.value.clone()))
            .unwrap_or_default();

        if email.trim().is_empty() {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>Google did not return an email address for this account.</p><p>Please close this tab and try again.</p>",
            );
            return Err(ProfileError::Auth(
                "Google profile response did not include an email address".to_string(),
            ));
        }

        let profile_id = Profile::id_from_email(&email);
        let profile_exists = store.get_profile(&profile_id)?.is_some();
        let policy_failure = match settings.account_policy {
            AuthAccountPolicy::Any => None,
            AuthAccountPolicy::ExistingOnly if !profile_exists => Some((
                "Account Not Found",
                "<p>This Google Account has not been added to Squigit yet.</p><p>Please close this tab and use signup first.</p>",
                "Account has not been added yet",
            )),
            AuthAccountPolicy::NewOnly if profile_exists => Some((
                "Account Already Added",
                "<p>This Google Account is already connected to Squigit.</p><p>Please close this tab and use login instead.</p>",
                "Account already exists",
            )),
            _ => None,
        };
        if let Some((title, content, error)) = policy_failure {
            respond_failure(request, title, content)?;
            return Err(ProfileError::Auth(error.to_string()));
        }

        let mut avatar_url = profile
            .photos
            .and_then(|items| items.first().and_then(|item| item.url.clone()))
            .unwrap_or_default();

        let avatar_url = if avatar_url.trim().is_empty() {
            None
        } else {
            if avatar_url.starts_with("http://")
                && !avatar_url.starts_with("http://127.0.0.1")
                && !avatar_url.starts_with("http://localhost")
            {
                avatar_url = avatar_url.replacen("http://", "https://", 1);
            }
            Some(avatar_url.clone())
        };

        let mut profile = Profile::new(&email, &name, None, avatar_url.clone());
        if let Some(existing_profile) = store.get_profile(&profile.id)? {
            profile.created_at = existing_profile.created_at;
        }
        profile.touch();

        if let Err(err) = store.upsert_profile(&profile) {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>Squigit could not save your profile locally.</p><p>Please close this tab and try again.</p>",
            );
            return Err(err);
        }
        if let Err(err) = store.set_active_profile_id(&profile.id) {
            let _ = respond_failure(
                request,
                "Authentication Failed",
                "<p>Squigit could not activate your profile locally.</p><p>Please close this tab and try again.</p>",
            );
            return Err(err);
        }

        let user_data = AuthSuccessData {
            id: profile.id.clone(),
            name: profile.name.clone(),
            email: profile.email.clone(),
            avatar_base64: profile.avatar_base64.clone(),
            avatar_url,
        };

        respond_success(
            request,
            "Authentication Successful",
            &format!(
                "<p>{} is now connected to your Google Account.</p><p>You can close this tab.</p>",
                "Squigit"
            ),
        )?;

        return Ok(user_data);
    }
}
