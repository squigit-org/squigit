// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use crate::Result;

use super::CredentialsSource;

const DEFAULT_USER_INFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const DEFAULT_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";

pub(super) const CANCELLED_CALLBACK_GRACE: Duration = Duration::from_secs(2);

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
    pub redirect_host: String,
    pub redirect_port: u16,
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
            .field("redirect_host", &self.redirect_host)
            .field("redirect_port", &self.redirect_port)
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
            redirect_host: "127.0.0.1".to_string(),
            redirect_port: 3000,
            user_info_url: DEFAULT_USER_INFO_URL.to_string(),
            jwks_url: DEFAULT_JWKS_URL.to_string(),
            timeout: Duration::from_secs(120),
            credentials_source: CredentialsSource::Auto,
            account_policy: AuthAccountPolicy::Any,
            open_browser,
        }
    }

    pub fn redirect_uri(&self) -> String {
        format!("http://{}:{}", self.redirect_host, self.redirect_port)
    }

    pub fn cancel_path(&self) -> String {
        "/squigit-cancel".to_string()
    }

    pub fn cancel_url(&self) -> String {
        format!("{}{}", self.redirect_uri(), self.cancel_path())
    }
}
