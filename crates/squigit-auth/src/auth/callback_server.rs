// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fmt;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

use reqwest::blocking::Client;

use crate::Result;

use super::CredentialsSource;

const DEFAULT_USER_INFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const DEFAULT_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";
const SQUIGIT_APP_DOMAIN: &str = "squigit.app";
const SQUIGIT_APP_REDIRECT_SCHEME: &str = "org.squigit.app";
const GOOGLE_CLIENT_ID_SCHEME_PREFIX: &str = "com.googleusercontent.apps.";
const GOOGLE_CLIENT_ID_SUFFIX: &str = ".apps.googleusercontent.com";
const GOOGLE_AUTH_REDIRECT_PATH: &str = "/oauth2redirect/google";
const DEFAULT_REDIRECT_URI: &str = "org.squigit.app:/oauth2redirect/google";
const SQUIGIT_APP_STATUS_PAGE_URL: &str = "https://squigit.app/login/popup-google-auth/";
const GITHUB_PAGES_STATUS_PAGE_URL: &str = "https://squigit-org.github.io/login/popup-google-auth/";
const DEFAULT_AUTH_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(4 * 60 * 60);
const SQUIGIT_APP_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
static SQUIGIT_APP_DOMAIN_AVAILABLE: OnceLock<bool> = OnceLock::new();

pub type BrowserOpener = Arc<dyn Fn(&str) -> Result<()> + Send + Sync>;

/// Controls whether an OAuth identity may create or refresh a stored profile.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum AuthAccountPolicy {
    /// Accept both new and previously stored accounts.
    #[default]
    Any,
    /// Accept only an account that already exists in the selected profile store.
    ExistingOnly,
    /// Accept only an account that does not yet exist in the selected profile store.
    NewOnly,
}

#[derive(Clone)]
pub struct AuthFlowSettings {
    pub redirect_uri: String,
    pub status_page_url: String,
    pub user_info_url: String,
    pub jwks_url: String,
    pub timeout: Duration,
    pub credentials_source: CredentialsSource,
    /// Account classification applied before avatar hydration or profile persistence.
    pub account_policy: AuthAccountPolicy,
    pub open_browser: BrowserOpener,
}

impl fmt::Debug for AuthFlowSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthFlowSettings")
            .field("redirect_uri", &self.redirect_uri)
            .field("status_page_url", &self.status_page_url)
            .field("user_info_url", &self.user_info_url)
            .field("jwks_url", &self.jwks_url)
            .field("timeout", &self.timeout)
            .field("credentials_source", &self.credentials_source)
            .field("account_policy", &self.account_policy)
            .finish()
    }
}

impl AuthFlowSettings {
    pub fn new(open_browser: BrowserOpener) -> Self {
        Self {
            redirect_uri: DEFAULT_REDIRECT_URI.to_string(),
            status_page_url: google_auth_status_page_url(),
            user_info_url: DEFAULT_USER_INFO_URL.to_string(),
            jwks_url: DEFAULT_JWKS_URL.to_string(),
            timeout: DEFAULT_AUTH_ATTEMPT_TIMEOUT,
            credentials_source: CredentialsSource::Auto,
            account_policy: AuthAccountPolicy::Any,
            open_browser,
        }
    }

    pub fn redirect_uri(&self) -> String {
        self.redirect_uri.clone()
    }

    pub fn redirect_uri_for_client_id(&self, client_id: &str) -> String {
        if self.redirect_uri.trim() != DEFAULT_REDIRECT_URI {
            return self.redirect_uri.clone();
        }

        google_auth_redirect_uri(client_id)
    }
}

pub fn google_auth_status_page_url() -> String {
    if squigit_app_domain_available() {
        SQUIGIT_APP_STATUS_PAGE_URL.to_string()
    } else {
        GITHUB_PAGES_STATUS_PAGE_URL.to_string()
    }
}

pub fn google_auth_redirect_schemes(client_id: Option<&str>) -> Vec<String> {
    let mut schemes = vec![SQUIGIT_APP_REDIRECT_SCHEME.to_string()];
    if let Some(scheme) = client_id.and_then(google_client_id_redirect_scheme) {
        if !schemes.iter().any(|candidate| candidate == &scheme) {
            schemes.push(scheme);
        }
    }
    schemes
}

pub fn google_auth_redirect_uri(client_id: &str) -> String {
    if squigit_app_domain_available() {
        DEFAULT_REDIRECT_URI.to_string()
    } else {
        google_client_id_redirect_uri(client_id).unwrap_or_else(|| DEFAULT_REDIRECT_URI.to_string())
    }
}

pub fn google_client_id_redirect_uri(client_id: &str) -> Option<String> {
    google_client_id_redirect_scheme(client_id)
        .map(|scheme| format!("{scheme}:{GOOGLE_AUTH_REDIRECT_PATH}"))
}

pub fn google_client_id_redirect_scheme(client_id: &str) -> Option<String> {
    let client_id = client_id.trim();
    let prefix = client_id.strip_suffix(GOOGLE_CLIENT_ID_SUFFIX)?;
    let prefix = prefix.trim();
    if prefix.is_empty() {
        return None;
    }
    Some(format!("{GOOGLE_CLIENT_ID_SCHEME_PREFIX}{prefix}"))
}

fn squigit_app_domain_available() -> bool {
    *SQUIGIT_APP_DOMAIN_AVAILABLE.get_or_init(|| {
        Client::builder()
            .timeout(SQUIGIT_APP_PROBE_TIMEOUT)
            .build()
            .and_then(|client| client.head(format!("https://{SQUIGIT_APP_DOMAIN}/")).send())
            .is_ok_and(|response| response.status().as_u16() < 500)
    })
}
