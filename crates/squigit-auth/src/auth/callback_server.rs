// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fmt;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use reqwest::blocking::Client;
use tiny_http::{Header, Request, Response, Server, StatusCode};
use url::Url;

use crate::{ProfileError, Result};

use super::CredentialsSource;

const DEFAULT_USER_INFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const DEFAULT_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";
const DEFAULT_AUTH_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(4 * 60 * 60);
const DEFAULT_REDIRECT_URI: &str = "http://127.0.0.1";
const LOOPBACK_HOST: &str = "127.0.0.1";
const LOOPBACK_RECV_INTERVAL: Duration = Duration::from_millis(250);
const SQUIGIT_APP_DOMAIN: &str = "squigit.app";
const SQUIGIT_APP_STATUS_PAGE_URL: &str = "https://squigit.app/login/popup-google-auth/";
const GITHUB_PAGES_STATUS_PAGE_URL: &str = "https://squigit-org.github.io/login/popup-google-auth/";
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

    pub fn redirect_uri_for_client_id(&self, _client_id: &str) -> String {
        self.redirect_uri.clone()
    }
}

pub fn google_auth_status_page_url() -> String {
    if squigit_app_domain_available() {
        SQUIGIT_APP_STATUS_PAGE_URL.to_string()
    } else {
        GITHUB_PAGES_STATUS_PAGE_URL.to_string()
    }
}

pub fn google_auth_status_page_url_for(base_url: &str, page: LoopbackAuthPage) -> String {
    let mut url = Url::parse(base_url)
        .or_else(|_| Url::parse(GITHUB_PAGES_STATUS_PAGE_URL))
        .expect("fallback Google auth status URL is valid");
    url.set_query(None);
    url.set_fragment(Some(page.fragment()));
    url.to_string()
}

pub struct LoopbackAuthServer {
    server: Server,
    origin: String,
    redirect_uri: String,
    redirect_path: String,
}

pub struct LoopbackAuthRequest {
    callback_url: String,
    request: Request,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LoopbackAuthPage {
    Success,
    Invalid,
}

impl LoopbackAuthPage {
    fn fragment(self) -> &'static str {
        match self {
            LoopbackAuthPage::Success => "success",
            LoopbackAuthPage::Invalid => "invalid",
        }
    }
}

impl LoopbackAuthServer {
    pub fn bind() -> Result<Self> {
        let server = Server::http((LOOPBACK_HOST, 0)).map_err(|err| {
            ProfileError::Auth(format!(
                "Failed to start local Google auth callback server: {err}"
            ))
        })?;
        let addr = server.server_addr().to_ip().ok_or_else(|| {
            ProfileError::Auth(
                "Local Google auth callback server did not bind to an IP address".to_string(),
            )
        })?;
        let origin = format!("http://{}:{}", LOOPBACK_HOST, addr.port());
        let redirect_uri = origin.clone();
        let redirect_path = Url::parse(&redirect_uri)
            .map(|url| url.path().to_string())
            .unwrap_or_else(|_| "/".to_string());

        Ok(Self {
            server,
            origin,
            redirect_uri,
            redirect_path,
        })
    }

    pub fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    pub fn recv_timeout(&self) -> Result<Option<LoopbackAuthRequest>> {
        let Some(request) = self.server.recv_timeout(LOOPBACK_RECV_INTERVAL)? else {
            return Ok(None);
        };

        match self.callback_url_for_request(&request) {
            Ok(callback_url) => Ok(Some(LoopbackAuthRequest {
                callback_url,
                request,
            })),
            Err(_) => {
                let _ = request.respond(not_found_response());
                Ok(None)
            }
        }
    }

    fn callback_url_for_request(&self, request: &Request) -> Result<String> {
        let raw_url = request.url();
        let callback_url = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
            raw_url.to_string()
        } else {
            format!("{}{}", self.origin, raw_url)
        };
        let parsed = Url::parse(&callback_url)?;

        if parsed.scheme() != "http"
            || parsed.host_str() != Some(LOOPBACK_HOST)
            || parsed.path() != self.redirect_path
        {
            return Err(ProfileError::Auth(
                "Ignoring non-OAuth loopback request".to_string(),
            ));
        }

        Ok(callback_url)
    }
}

impl LoopbackAuthRequest {
    pub fn callback_url(&self) -> &str {
        &self.callback_url
    }

    pub fn redirect(self, location: &str) -> Result<()> {
        self.request
            .respond(redirect_response(location))
            .map_err(ProfileError::Io)
    }
}

fn not_found_response() -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string("Not found")
        .with_status_code(StatusCode(404))
        .with_header(text_header())
}

fn redirect_response(location: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string("")
        .with_status_code(StatusCode(302))
        .with_header(location_header(location))
        .with_header(connection_close_header())
        .with_header(cache_header())
        .with_header(referrer_header())
}

fn text_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()
}

fn location_header(location: &str) -> Header {
    Header::from_bytes(&b"Location"[..], location.as_bytes()).unwrap()
}

fn connection_close_header() -> Header {
    Header::from_bytes(&b"Connection"[..], &b"close"[..]).unwrap()
}

fn cache_header() -> Header {
    Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap()
}

fn referrer_header() -> Header {
    Header::from_bytes(&b"Referrer-Policy"[..], &b"no-referrer"[..]).unwrap()
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
