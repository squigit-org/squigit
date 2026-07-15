// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;
use std::path::PathBuf;
use std::sync::Once;

use serde::Deserialize;

use crate::{ProfileError, Result};

use super::AuthFlowSettings;

const EMBEDDED_SECRETS_JSON: &str = include_str!(env!("SQUIGIT_GOOGLE_CREDENTIALS_EMBEDDED_FILE"));
static AUTH_MISSING_CREDENTIALS_LOG_ONCE: Once = Once::new();

#[derive(Clone, Debug)]
pub enum CredentialsSource {
    Auto,
    RawJson(String),
    File(PathBuf),
}

#[derive(Deserialize, Debug)]
struct GoogleCredentials {
    installed: Option<OAuthConfig>,
    web: Option<OAuthConfig>,
}

#[derive(Deserialize, Debug, Clone)]
pub(super) struct OAuthConfig {
    pub(super) client_id: String,
    #[serde(rename = "client_secret")]
    pub(super) client_secret: Option<String>,
    pub(super) auth_uri: String,
    pub(super) token_uri: String,
}

fn missing_credentials_message() -> String {
    "Google authentication is not configured in this build. The app can run normally, but sign-in is disabled.\n\nTo enable Google auth, provide credentials using one of:\n- copy crates/squigit-auth/assets/oauth/credentials.example.json to crates/squigit-auth/assets/oauth/credentials.json (gitignored)\n- SQUIGIT_GOOGLE_CREDENTIALS_PATH=<absolute path to credentials.json>\n- SQUIGIT_GOOGLE_CREDENTIALS_JSON=<raw credentials json>".to_string()
}

fn load_google_credentials_raw(source: &CredentialsSource) -> Result<String> {
    match source {
        CredentialsSource::RawJson(raw) => Ok(raw.clone()),
        CredentialsSource::File(path) => Ok(fs::read_to_string(path)?),
        CredentialsSource::Auto => {
            if let Ok(raw) = std::env::var("SQUIGIT_GOOGLE_CREDENTIALS_JSON") {
                if !raw.trim().is_empty() {
                    return Ok(raw);
                }
            }

            if let Ok(path) = std::env::var("SQUIGIT_GOOGLE_CREDENTIALS_PATH") {
                let trimmed = path.trim();
                if !trimmed.is_empty() {
                    return fs::read_to_string(trimmed).map_err(|err| {
                        ProfileError::Auth(format!(
                            "Failed reading SQUIGIT_GOOGLE_CREDENTIALS_PATH: {}",
                            err
                        ))
                    });
                }
            }

            Ok(EMBEDDED_SECRETS_JSON.to_string())
        }
    }
}

fn is_placeholder_config(config: &OAuthConfig) -> bool {
    config.client_id.contains("replace-me") || config.client_id.trim().is_empty()
}

pub(super) fn load_google_oauth_config(settings: &AuthFlowSettings) -> Result<OAuthConfig> {
    let raw = load_google_credentials_raw(&settings.credentials_source)?;
    let raw = raw.trim();
    if raw.is_empty() {
        let message = missing_credentials_message();
        AUTH_MISSING_CREDENTIALS_LOG_ONCE.call_once(|| {
            eprintln!("[auth] {}", message.replace('\n', "\n[auth] "));
        });
        return Err(ProfileError::MissingCredentials(message));
    }

    let wrapper: GoogleCredentials = serde_json::from_str(raw).map_err(|err| {
        ProfileError::Auth(format!("Failed to parse Google OAuth credentials: {}", err))
    })?;

    let config = wrapper.installed.or(wrapper.web).ok_or_else(|| {
        ProfileError::Auth(
            "Invalid credentials.json: missing 'installed' or 'web' object".to_string(),
        )
    })?;

    if is_placeholder_config(&config) {
        let message = missing_credentials_message();
        AUTH_MISSING_CREDENTIALS_LOG_ONCE.call_once(|| {
            eprintln!("[auth] {}", message.replace('\n', "\n[auth] "));
        });
        return Err(ProfileError::MissingCredentials(message));
    }

    Ok(config)
}

pub fn validate_google_credentials(settings: &AuthFlowSettings) -> Result<()> {
    load_google_oauth_config(settings).map(|_| ())
}
