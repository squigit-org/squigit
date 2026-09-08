// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;
use std::path::PathBuf;
use std::sync::Once;

use serde::Deserialize;

use crate::{ProfileError, Result};

use super::AuthFlowSettings;

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
    "Google authentication credentials were not provided. In release mode, credentials must be supplied explicitly (e.g. via squigit-rs runtime secrets, CredentialsSource::RawJson, or SQUIGIT_GOOGLE_CREDENTIALS_JSON / SQUIGIT_GOOGLE_CREDENTIALS_PATH).".to_string()
}

#[cfg(debug_assertions)]
fn dev_asset_credentials_path() -> Option<PathBuf> {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = manifest_dir
        .join("assets")
        .join("oauth")
        .join("credentials.json");
    if path.is_file() {
        Some(path)
    } else {
        None
    }
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

            #[cfg(debug_assertions)]
            {
                if let Some(path) = dev_asset_credentials_path() {
                    if let Ok(contents) = fs::read_to_string(&path) {
                        let trimmed = contents.trim();
                        if !trimmed.is_empty() {
                            return Ok(trimmed.to_string());
                        }
                    }
                }
            }

            let message = missing_credentials_message();
            AUTH_MISSING_CREDENTIALS_LOG_ONCE.call_once(|| {
                eprintln!("[auth] {}", message.replace('\n', "\n[auth] "));
            });
            Err(ProfileError::MissingCredentials(message))
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
