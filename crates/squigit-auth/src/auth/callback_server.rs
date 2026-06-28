// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use crate::Result;

use super::CredentialsSource;

const DEFAULT_USER_INFO_URL: &str =
    "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos";

pub(super) const CANCELLED_CALLBACK_GRACE: Duration = Duration::from_secs(0);

pub type BrowserOpener = Arc<dyn Fn(&str) -> Result<()> + Send + Sync>;

#[derive(Clone)]
pub struct AuthFlowSettings {
    pub app_name: String,
    pub redirect_host: String,
    pub redirect_port: u16,
    pub user_info_url: String,
    pub timeout: Duration,
    pub credentials_source: CredentialsSource,
    pub open_browser: BrowserOpener,
}

impl fmt::Debug for AuthFlowSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthFlowSettings")
            .field("app_name", &self.app_name)
            .field("redirect_host", &self.redirect_host)
            .field("redirect_port", &self.redirect_port)
            .field("user_info_url", &self.user_info_url)
            .field("timeout", &self.timeout)
            .field("credentials_source", &self.credentials_source)
            .finish()
    }
}

impl AuthFlowSettings {
    pub fn new(app_name: impl Into<String>, open_browser: BrowserOpener) -> Self {
        Self {
            app_name: app_name.into(),
            redirect_host: "127.0.0.1".to_string(),
            redirect_port: 3000,
            user_info_url: DEFAULT_USER_INFO_URL.to_string(),
            timeout: Duration::from_secs(120),
            credentials_source: CredentialsSource::Auto,
            open_browser,
        }
    }

    pub fn redirect_uri(&self) -> String {
        format!("http://{}:{}", self.redirect_host, self.redirect_port)
    }

    pub fn cancel_path(&self) -> String {
        format!("/{}-cancel", self.app_name.to_lowercase())
    }

    pub fn cancel_url(&self) -> String {
        format!("{}{}", self.redirect_uri(), self.cancel_path())
    }
}
