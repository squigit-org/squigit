// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{
    engine::{general_purpose, general_purpose::URL_SAFE_NO_PAD},
    Engine as _,
};
use chrono::{DateTime, Utc};
use image::ImageFormat;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use reqwest::blocking::{Client, Response};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::io::Cursor;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use url::Url;

use crate::types::{canonical_google_issuer, LastLogin, GOOGLE_PROVIDER};
use crate::{Profile, ProfileError, ProfileStore, Result};

use super::credentials::load_google_oauth_config;
use super::{AuthAccountPolicy, AuthFlowSettings};

const AVATAR_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const TOKEN_EXCHANGE_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const TOKEN_EXCHANGE_RETRY_DELAYS: [Duration; 6] = [
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
    Duration::from_secs(20),
    Duration::from_secs(40),
    Duration::from_secs(60),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthSuccessData {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_base64: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Clone)]
pub struct GoogleAuthAttempt {
    auth_url: String,
    state: String,
    nonce: String,
    code_verifier: String,
    redirect_uri: String,
    client_id: String,
    client_secret: Option<String>,
    token_uri: String,
    started_at: Instant,
}

impl fmt::Debug for GoogleAuthAttempt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GoogleAuthAttempt")
            .field("auth_url", &self.auth_url)
            .field("state", &self.state)
            .field("redirect_uri", &self.redirect_uri)
            .field("client_id", &self.client_id)
            .field("token_uri", &self.token_uri)
            .field("started_at", &self.started_at)
            .finish_non_exhaustive()
    }
}

impl GoogleAuthAttempt {
    pub fn auth_url(&self) -> &str {
        &self.auth_url
    }

    pub fn state(&self) -> &str {
        &self.state
    }

    pub fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    fn is_expired(&self, timeout: Duration) -> bool {
        self.started_at.elapsed() > timeout
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    id_token: String,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GoogleIdTokenClaims {
    iss: String,
    sub: String,
    aud: String,
    exp: u64,
    iat: u64,
    nonce: Option<String>,
    email: Option<String>,
    email_verified: Option<serde_json::Value>,
    name: Option<String>,
    picture: Option<String>,
}

#[derive(Deserialize)]
struct OidcUserInfo {
    sub: String,
    email: Option<String>,
    email_verified: Option<serde_json::Value>,
    name: Option<String>,
    picture: Option<String>,
}

fn generate_state_token() -> String {
    generate_urlsafe_token(32)
}

fn generate_code_verifier() -> String {
    generate_urlsafe_token(32)
}

fn generate_nonce() -> String {
    generate_urlsafe_token(32)
}

fn generate_urlsafe_token(byte_len: usize) -> String {
    use rand::{rngs::OsRng, RngCore};

    let mut bytes = vec![0u8; byte_len];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn code_challenge_s256(code_verifier: &str) -> String {
    use sha2::{Digest, Sha256};

    let digest = Sha256::digest(code_verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn jwt_timestamp_to_datetime(value: u64, field: &str) -> Result<DateTime<Utc>> {
    DateTime::<Utc>::from_timestamp(value as i64, 0).ok_or_else(|| {
        ProfileError::Auth(format!(
            "Google ID token contained an invalid '{}' timestamp",
            field
        ))
    })
}

fn email_verified_is_false(value: Option<&serde_json::Value>) -> bool {
    match value {
        Some(serde_json::Value::Bool(false)) => true,
        Some(serde_json::Value::String(value)) if value.eq_ignore_ascii_case("false") => true,
        _ => false,
    }
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn granted_scopes(scope: Option<&str>) -> Vec<String> {
    let scopes = scope
        .unwrap_or("openid profile email")
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();

    if scopes.is_empty() {
        vec![
            "openid".to_string(),
            "profile".to_string(),
            "email".to_string(),
        ]
    } else {
        scopes
    }
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
        return Err(ProfileError::Auth(
            "Downloaded avatar is empty.".to_string(),
        ));
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
    let client = Client::builder().timeout(AVATAR_DOWNLOAD_TIMEOUT).build()?;
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
                let delay = retry_delays.get(attempt).copied().unwrap_or(60);
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

fn validate_google_id_token(
    client: &Client,
    settings: &AuthFlowSettings,
    id_token: &str,
    client_id: &str,
    expected_nonce: &str,
) -> Result<GoogleIdTokenClaims> {
    let header = decode_header(id_token)
        .map_err(|err| ProfileError::Auth(format!("Failed to decode ID token header: {}", err)))?;

    if header.alg != Algorithm::RS256 {
        return Err(ProfileError::Auth(format!(
            "Unexpected Google ID token algorithm: {:?}",
            header.alg
        )));
    }

    let kid = header.kid.ok_or_else(|| {
        ProfileError::Auth("Google ID token header did not include kid".to_string())
    })?;

    let jwks_response = client.get(&settings.jwks_url).send()?;
    if !jwks_response.status().is_success() {
        return Err(ProfileError::Auth(format!(
            "Failed to fetch Google JWKS: HTTP {}",
            jwks_response.status()
        )));
    }

    let jwks: JwkSet = jwks_response.json().map_err(|err| {
        ProfileError::Auth(format!("Failed to decode Google JWKS response: {}", err))
    })?;
    let jwk = jwks
        .find(&kid)
        .ok_or_else(|| ProfileError::Auth("Google JWKS did not include token kid".to_string()))?;
    let decoding_key = DecodingKey::from_jwk(jwk)
        .map_err(|err| ProfileError::Auth(format!("Failed to load Google JWK: {}", err)))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&["https://accounts.google.com", "accounts.google.com"]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);

    let token_data = decode::<GoogleIdTokenClaims>(id_token, &decoding_key, &validation)
        .map_err(|err| ProfileError::Auth(format!("Google ID token validation failed: {}", err)))?;
    let claims = token_data.claims;

    if claims.nonce.as_deref() != Some(expected_nonce) {
        return Err(ProfileError::Auth(
            "Google ID token nonce mismatch".to_string(),
        ));
    }
    if claims.sub.trim().is_empty() {
        return Err(ProfileError::Auth(
            "Google ID token did not include a subject".to_string(),
        ));
    }
    if email_verified_is_false(claims.email_verified.as_ref()) {
        return Err(ProfileError::Auth(
            "Google account email is not verified".to_string(),
        ));
    }

    Ok(claims)
}

fn complete_display_claims(
    client: &Client,
    settings: &AuthFlowSettings,
    claims: &GoogleIdTokenClaims,
    access_token: Option<&str>,
) -> Result<(String, String, Option<String>)> {
    let mut email = normalize_optional_string(claims.email.clone());
    let mut name = normalize_optional_string(claims.name.clone());
    let mut picture = normalize_optional_string(claims.picture.clone());

    if (email.is_none() || name.is_none() || picture.is_none())
        && access_token.is_some_and(|token| !token.trim().is_empty())
    {
        let token = access_token.unwrap();
        let user_info_res = client
            .get(&settings.user_info_url)
            .bearer_auth(token)
            .send()?;

        if user_info_res.status().is_success() {
            let user_info: OidcUserInfo = user_info_res.json().map_err(|err| {
                ProfileError::Auth(format!(
                    "Failed to decode Google UserInfo response: {}",
                    err
                ))
            })?;

            if user_info.sub != claims.sub {
                return Err(ProfileError::Auth(
                    "Google UserInfo subject did not match ID token subject".to_string(),
                ));
            }
            if email_verified_is_false(user_info.email_verified.as_ref()) {
                return Err(ProfileError::Auth(
                    "Google account email is not verified".to_string(),
                ));
            }

            email = email.or_else(|| normalize_optional_string(user_info.email));
            name = name.or_else(|| normalize_optional_string(user_info.name));
            picture = picture.or_else(|| normalize_optional_string(user_info.picture));
        }
    }

    let email = email.ok_or_else(|| {
        ProfileError::Auth("Google identity response did not include an email address".to_string())
    })?;

    Ok((
        name.unwrap_or_else(|| "Squigit User".to_string()),
        email,
        picture,
    ))
}

pub fn begin_google_auth_flow(settings: &AuthFlowSettings) -> Result<GoogleAuthAttempt> {
    let secrets = load_google_oauth_config(settings)?;
    let state = generate_state_token();
    let nonce = generate_nonce();
    let code_verifier = generate_code_verifier();
    let code_challenge = code_challenge_s256(&code_verifier);
    let redirect_uri = settings.redirect_uri_for_client_id(&secrets.client_id);

    let mut auth_url = Url::parse(&secrets.auth_uri)?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &secrets.client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid profile email")
        .append_pair("access_type", "online")
        .append_pair("prompt", "select_account")
        .append_pair("state", &state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(GoogleAuthAttempt {
        auth_url: auth_url.to_string(),
        state,
        nonce,
        code_verifier,
        redirect_uri,
        client_id: secrets.client_id,
        client_secret: secrets
            .client_secret
            .filter(|secret| !secret.trim().is_empty()),
        token_uri: secrets.token_uri,
        started_at: Instant::now(),
    })
}

fn redirect_uri_matches(callback_url: &Url, expected_redirect_uri: &str) -> Result<bool> {
    let expected = Url::parse(expected_redirect_uri)?;
    Ok(callback_url.scheme() == expected.scheme()
        && callback_url.username() == expected.username()
        && callback_url.password() == expected.password()
        && callback_url.host_str() == expected.host_str()
        && callback_url.port_or_known_default() == expected.port_or_known_default()
        && callback_url.path() == expected.path())
}

pub fn google_auth_callback_state(
    callback_url: &str,
    expected_redirect_uri: &str,
) -> Result<String> {
    let url = Url::parse(callback_url).map_err(|err| {
        ProfileError::Auth(format!("Failed to parse OAuth callback URL: {}", err))
    })?;

    if !redirect_uri_matches(&url, expected_redirect_uri)? {
        return Err(ProfileError::Auth(
            "OAuth callback URL did not match the expected redirect URI".to_string(),
        ));
    }

    url.query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ProfileError::Auth("OAuth callback did not include state".to_string()))
}

fn authorization_code_from_callback(
    callback_url: &str,
    expected_redirect_uri: &str,
    expected_state: &str,
) -> Result<String> {
    let url = Url::parse(callback_url).map_err(|err| {
        ProfileError::Auth(format!("Failed to parse OAuth callback URL: {}", err))
    })?;

    if !redirect_uri_matches(&url, expected_redirect_uri)? {
        return Err(ProfileError::Auth(
            "OAuth callback URL did not match the expected redirect URI".to_string(),
        ));
    }

    let returned_state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned());
    if returned_state.as_deref() != Some(expected_state) {
        return Err(ProfileError::Auth(
            "OAuth callback state mismatch".to_string(),
        ));
    }

    if let Some((_, error_code)) = url.query_pairs().find(|(key, _)| key == "error") {
        return Err(ProfileError::Auth(format!(
            "Google sign-in returned an error: {}",
            error_code
        )));
    }

    url.query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ProfileError::Auth("No authorization code found in callback".to_string()))
}

fn decode_token_response(response: Response) -> Result<TokenResponse> {
    response.json().map_err(|err| {
        ProfileError::Auth(format!("Failed to decode Google token response: {}", err))
    })
}

fn read_token_error(response: Response) -> (StatusCode, String) {
    let status = response.status();
    let body = response.text().unwrap_or_default();
    (status, body)
}

fn token_exchange_error_message(status: StatusCode, body: &str) -> String {
    let trimmed = body.trim();
    if let Ok(error) = serde_json::from_str::<TokenErrorResponse>(trimmed) {
        let mut details = Vec::new();
        if let Some(code) = error.error.filter(|value| !value.trim().is_empty()) {
            details.push(code);
        }
        if let Some(description) = error
            .error_description
            .filter(|value| !value.trim().is_empty())
        {
            details.push(description);
        }
        if !details.is_empty() {
            return format!(
                "Google refused token exchange: HTTP {} ({})",
                status,
                details.join(": ")
            );
        }
    }

    if trimmed.is_empty() {
        return format!("Google refused token exchange: HTTP {}", status);
    }

    let detail: String = trimmed.chars().take(600).collect();
    format!(
        "Google refused token exchange: HTTP {} ({})",
        status, detail
    )
}

fn token_error_mentions_client_secret(body: &str) -> bool {
    let body = body.to_ascii_lowercase();
    body.contains("client_secret") || body.contains("client secret")
}

fn post_token_form(
    client: &Client,
    attempt: &GoogleAuthAttempt,
    token_form: &[(String, String)],
) -> std::result::Result<Response, reqwest::Error> {
    client.post(&attempt.token_uri).form(token_form).send()
}

fn post_token_form_with_retries(
    client: &Client,
    attempt: &GoogleAuthAttempt,
    token_form: &[(String, String)],
) -> Result<Response> {
    let max_attempts = TOKEN_EXCHANGE_RETRY_DELAYS.len() + 1;

    for attempt_index in 0..max_attempts {
        match post_token_form(client, attempt, token_form) {
            Ok(response) => return Ok(response),
            Err(err) => {
                let attempt_number = attempt_index + 1;
                let Some(delay) = TOKEN_EXCHANGE_RETRY_DELAYS.get(attempt_index) else {
                    return Err(ProfileError::Auth(format!(
                        "Token exchange failed after {max_attempts} attempts: {err}"
                    )));
                };

                eprintln!(
                    "[auth] Token exchange transport failed on attempt {attempt_number}/{max_attempts}: {err}. Retrying in {}s.",
                    delay.as_secs()
                );
                thread::sleep(*delay);
            }
        }
    }

    Err(ProfileError::Auth(
        "Token exchange failed before Google returned a response".to_string(),
    ))
}

fn exchange_authorization_code(
    client: &Client,
    attempt: &GoogleAuthAttempt,
    code: String,
) -> Result<TokenResponse> {
    let token_form = vec![
        ("client_id".to_string(), attempt.client_id.clone()),
        ("code".to_string(), code),
        ("code_verifier".to_string(), attempt.code_verifier.clone()),
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("redirect_uri".to_string(), attempt.redirect_uri.clone()),
    ];
    let token_res = post_token_form_with_retries(client, attempt, &token_form)?;

    if token_res.status().is_success() {
        return decode_token_response(token_res);
    }

    let (status, body) = read_token_error(token_res);
    if token_error_mentions_client_secret(&body) {
        if let Some(client_secret) = attempt.client_secret.as_deref() {
            let mut token_form_with_secret = token_form;
            token_form_with_secret.push(("client_secret".to_string(), client_secret.to_string()));
            let retry_res = post_token_form_with_retries(client, attempt, &token_form_with_secret)?;
            if retry_res.status().is_success() {
                return decode_token_response(retry_res);
            }

            let (retry_status, retry_body) = read_token_error(retry_res);
            return Err(ProfileError::Auth(token_exchange_error_message(
                retry_status,
                &retry_body,
            )));
        }
    }

    Err(ProfileError::Auth(token_exchange_error_message(
        status, &body,
    )))
}

pub fn complete_google_auth_flow(
    store: &ProfileStore,
    settings: &AuthFlowSettings,
    attempt: GoogleAuthAttempt,
    callback_url: &str,
) -> Result<AuthSuccessData> {
    if attempt.is_expired(settings.timeout) {
        return Err(ProfileError::Auth("Authentication timed out".to_string()));
    }

    let code =
        authorization_code_from_callback(callback_url, &attempt.redirect_uri, &attempt.state)?;

    let client = Client::builder()
        .timeout(TOKEN_EXCHANGE_TIMEOUT)
        .http1_only()
        .pool_max_idle_per_host(0)
        .build()?;
    let token_data = exchange_authorization_code(&client, &attempt, code)?;

    let claims = validate_google_id_token(
        &client,
        settings,
        &token_data.id_token,
        &attempt.client_id,
        &attempt.nonce,
    )?;

    let (name, email, picture) = complete_display_claims(
        &client,
        settings,
        &claims,
        token_data.access_token.as_deref(),
    )?;

    let identity_issuer = canonical_google_issuer(&claims.iss);
    let identity = crate::types::ProfileIdentity::google(identity_issuer, &claims.sub);
    let profile_id = Profile::id_from_identity(&identity);
    let profile_exists = store.get_profile(&profile_id)?.is_some();
    let policy_failure = match settings.account_policy {
        AuthAccountPolicy::Any => None,
        AuthAccountPolicy::ExistingOnly if !profile_exists => {
            Some("Account has not been added yet")
        }
        AuthAccountPolicy::NewOnly if profile_exists => Some("Account already exists"),
        _ => None,
    };
    if let Some(error) = policy_failure {
        return Err(ProfileError::Auth(error.to_string()));
    }

    let mut avatar_url = picture.unwrap_or_default();

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

    let mut profile = Profile::new_google(
        identity_issuer,
        &claims.sub,
        &email,
        &name,
        None,
        avatar_url.clone(),
    );
    if let Some(existing_profile) = store.get_profile(&profile.id)? {
        profile.created_at = existing_profile.created_at;
    }
    profile.touch();
    store.upsert_profile(&profile)?;

    let id_token_issued_at = jwt_timestamp_to_datetime(claims.iat, "iat")?;
    let id_token_expires_at = jwt_timestamp_to_datetime(claims.exp, "exp")?;

    let last_login = LastLogin {
        profile_id: profile.id.clone(),
        provider: GOOGLE_PROVIDER.to_string(),
        issuer: identity_issuer.to_string(),
        subject: claims.sub.clone(),
        authenticated_at: Utc::now(),
        audience: claims.aud.clone(),
        scope: granted_scopes(token_data.scope.as_deref()),
        pkce_method: "S256".to_string(),
        id_token_issued_at,
        id_token_expires_at,
    };

    store.record_last_login(last_login)?;

    Ok(AuthSuccessData {
        id: profile.id.clone(),
        name: profile.name.clone(),
        email: profile.email.clone(),
        avatar_base64: profile.avatar_base64.clone(),
        avatar_url,
    })
}
