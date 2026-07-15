// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::env;
use std::sync::Arc;
use std::thread;

use serial_test::serial;
use squigit_auth::auth::{
    begin_google_auth_flow, complete_google_auth_flow, AuthAccountPolicy, AuthFlowSettings,
    AuthSuccessData, CredentialsSource, GoogleAuthAttempt,
};
use squigit_auth::{Profile, ProfileError, ProfileStore};
use tempfile::tempdir;
use tiny_http::{Header, Response, Server, StatusCode};
use url::Url;

fn free_port() -> u16 {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn temp_store() -> ProfileStore {
    let dir = tempdir().unwrap();
    let root = dir.path().to_path_buf();
    std::mem::forget(dir);
    ProfileStore::with_base_dir(root.to_path_buf()).unwrap()
}

fn callback_url_for_attempt(attempt: &GoogleAuthAttempt, code: &str) -> String {
    let auth_url = Url::parse(attempt.auth_url()).unwrap();
    let query = |key: &str| {
        auth_url
            .query_pairs()
            .find(|(candidate, _)| candidate == key)
            .map(|(_, value)| value.into_owned())
            .unwrap()
    };
    assert_eq!(query("prompt"), "select_account");
    format!(
        "{}?code={code}&state={}",
        query("redirect_uri"),
        query("state")
    )
}

struct EnvGuard {
    key: &'static str,
    old_value: Option<String>,
}

impl EnvGuard {
    fn set(key: &'static str, value: impl Into<String>) -> Self {
        let old_value = env::var(key).ok();
        env::set_var(key, value.into());
        Self { key, old_value }
    }

    fn unset(key: &'static str) -> Self {
        let old_value = env::var(key).ok();
        env::remove_var(key);
        Self { key, old_value }
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        if let Some(value) = &self.old_value {
            env::set_var(self.key, value);
        } else {
            env::remove_var(self.key);
        }
    }
}

fn run_policy_flow(
    store: &ProfileStore,
    policy: AuthAccountPolicy,
    email: &str,
    name: &str,
) -> (Result<AuthSuccessData, ProfileError>, String) {
    let oauth_port = free_port();
    let _no_proxy_guard = EnvGuard::set("NO_PROXY", "127.0.0.1,localhost");
    let _no_proxy_lower_guard = EnvGuard::set("no_proxy", "127.0.0.1,localhost");
    let email = email.to_string();
    let name = name.to_string();

    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let server_handle = thread::spawn({
        let email = email.clone();
        let name = name.clone();
        move || {
            let server = Server::http(("127.0.0.1", oauth_port)).unwrap();
            ready_tx.send(()).unwrap();
            for _ in 0..2 {
                let request = server.recv().unwrap();
                match request.url() {
                    "/token" => {
                        request
                            .respond(
                                Response::from_string(r#"{"access_token":"test-access"}"#)
                                    .with_header(
                                        Header::from_bytes(
                                            &b"Content-Type"[..],
                                            &b"application/json"[..],
                                        )
                                        .unwrap(),
                                    ),
                            )
                            .unwrap();
                    }
                    "/userinfo" => {
                        request
                            .respond(
                                Response::from_string(format!(
                                    r#"{{
                                        "names": [{{ "displayName": "{}" }}],
                                        "emailAddresses": [{{ "value": "{}" }}]
                                    }}"#,
                                    name, email
                                ))
                                .with_header(
                                    Header::from_bytes(
                                        &b"Content-Type"[..],
                                        &b"application/json"[..],
                                    )
                                    .unwrap(),
                                ),
                            )
                            .unwrap();
                    }
                    path => panic!("unexpected policy stub path: {path}"),
                }
            }
        }
    });
    ready_rx.recv().unwrap();

    let credentials = format!(
        r#"{{
            "installed": {{
                "client_id": "test-client.apps.googleusercontent.com",
                "client_secret": "test-secret",
                "auth_uri": "https://accounts.example.test/auth",
                "token_uri": "http://127.0.0.1:{oauth_port}/token"
            }}
        }}"#
    );
    let mut settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
    settings.user_info_url = format!("http://127.0.0.1:{oauth_port}/userinfo");
    settings.credentials_source = CredentialsSource::RawJson(credentials);
    settings.account_policy = policy;

    let attempt = begin_google_auth_flow(&settings).unwrap();
    let callback_url = callback_url_for_attempt(&attempt, "test-code");
    let result = complete_google_auth_flow(store, &settings, attempt, &callback_url);
    let body = result
        .as_ref()
        .map(|_| "Authentication Successful".to_string())
        .unwrap_or_else(|err| err.to_string());
    server_handle.join().unwrap();
    (result, body)
}

#[test]
fn placeholder_credentials_are_rejected() {
    let mut settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
    settings.credentials_source = CredentialsSource::RawJson(
        r#"{
            "installed": {
                "client_id": "replace-me.apps.googleusercontent.com",
                "client_secret": "replace-me",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        }"#
        .to_string(),
    );

    let err = begin_google_auth_flow(&settings).unwrap_err();
    assert!(matches!(err, ProfileError::MissingCredentials(_)));
}

#[test]
#[serial]
fn auto_credentials_source_prefers_raw_env_over_path_env() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("credentials.json");
    std::fs::write(&path, "not-json").unwrap();

    let _path_guard = EnvGuard::set(
        "SQUIGIT_GOOGLE_CREDENTIALS_PATH",
        path.to_string_lossy().to_string(),
    );
    let _json_guard = EnvGuard::set(
        "SQUIGIT_GOOGLE_CREDENTIALS_JSON",
        r#"{
            "installed": {
                "client_id": "test-client.apps.googleusercontent.com",
                "client_secret": "test-secret",
                "auth_uri": "https://example.com/o/oauth2/auth",
                "token_uri": "https://example.com/oauth2/token"
            }
        }"#,
    );

    let mut settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
    settings.credentials_source = CredentialsSource::Auto;

    let attempt = begin_google_auth_flow(&settings).unwrap();
    assert!(attempt
        .auth_url()
        .starts_with("https://example.com/o/oauth2/auth?"));
}

#[test]
#[serial]
fn auto_credentials_source_can_use_path_env() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("credentials.json");
    std::fs::write(
        &path,
        r#"{
            "installed": {
                "client_id": "test-client.apps.googleusercontent.com",
                "client_secret": "test-secret",
                "auth_uri": "https://example.com/o/oauth2/auth",
                "token_uri": "https://example.com/oauth2/token"
            }
        }"#,
    )
    .unwrap();

    let _json_guard = EnvGuard::unset("SQUIGIT_GOOGLE_CREDENTIALS_JSON");
    let _path_guard = EnvGuard::set(
        "SQUIGIT_GOOGLE_CREDENTIALS_PATH",
        path.to_string_lossy().to_string(),
    );

    let mut settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
    settings.credentials_source = CredentialsSource::Auto;

    let attempt = begin_google_auth_flow(&settings).unwrap();
    assert!(attempt
        .auth_url()
        .starts_with("https://example.com/o/oauth2/auth?"));
}

#[test]
#[serial]
fn complete_google_auth_flow_round_trips_against_stub_endpoints() {
    let store = temp_store();
    let oauth_port = free_port();
    let avatar_url = format!("http://127.0.0.1:{}/avatar", oauth_port);
    let _no_proxy_guard = EnvGuard::set("NO_PROXY", "127.0.0.1,localhost");
    let _no_proxy_lower_guard = EnvGuard::set("no_proxy", "127.0.0.1,localhost");

    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let server_handle = thread::spawn({
        let avatar_url = avatar_url.clone();
        move || {
            let server = Server::http(("127.0.0.1", oauth_port)).unwrap();
            ready_tx.send(()).unwrap();
            for _ in 0..4 {
                let request = server.recv().unwrap();
                let parsed =
                    Url::parse(&format!("http://127.0.0.1:{}{}", oauth_port, request.url()))
                        .unwrap();

                match parsed.path() {
                    "/auth" => {
                        let redirect_uri = parsed
                            .query_pairs()
                            .find(|(key, _)| key == "redirect_uri")
                            .map(|(_, value)| value.into_owned())
                            .unwrap();
                        let state = parsed
                            .query_pairs()
                            .find(|(key, _)| key == "state")
                            .map(|(_, value)| value.into_owned())
                            .unwrap();
                        let location = format!("{}/?code=test-code&state={}", redirect_uri, state);
                        let response = Response::from_string("")
                            .with_status_code(StatusCode(302))
                            .with_header(
                                Header::from_bytes(&b"Location"[..], location.as_bytes()).unwrap(),
                            );
                        request.respond(response).unwrap();
                    }
                    "/token" => {
                        let response = Response::from_string(r#"{"access_token":"test-access"}"#)
                            .with_header(
                                Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                    .unwrap(),
                            );
                        request.respond(response).unwrap();
                    }
                    "/userinfo" => {
                        let response = Response::from_string(format!(
                            r#"{{
                                "names": [{{ "displayName": "Integration User" }}],
                                "emailAddresses": [{{ "value": "integration@example.com" }}],
                                "photos": [{{ "url": "{}" }}]
                            }}"#,
                            avatar_url
                        ))
                        .with_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .unwrap(),
                        );
                        request.respond(response).unwrap();
                    }
                    "/avatar" => {
                        let response = Response::from_data(vec![9u8, 8, 7, 6]).with_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"image/png"[..]).unwrap(),
                        );
                        request.respond(response).unwrap();
                    }
                    path => panic!("unexpected stub path: {}", path),
                }
            }
        }
    });
    ready_rx.recv().unwrap();

    let raw_credentials = format!(
        r#"{{
            "installed": {{
                "client_id": "test-client.apps.googleusercontent.com",
                "client_secret": "test-secret",
                "auth_uri": "http://127.0.0.1:{}/auth",
                "token_uri": "http://127.0.0.1:{}/token"
            }}
        }}"#,
        oauth_port, oauth_port
    );

    let (callback_tx, callback_rx) = std::sync::mpsc::channel();
    let mut settings = AuthFlowSettings::new(Arc::new(move |url| {
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(ProfileError::Network)?;
        let response = client.get(url).send()?;
        if response.status() != reqwest::StatusCode::FOUND {
            return Err(ProfileError::Auth(format!(
                "Unexpected browser status: {}",
                response.status()
            )));
        }

        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                ProfileError::Auth("OAuth stub redirect did not include Location".to_string())
            })?
            .to_string();

        callback_tx.send(location).unwrap();

        Ok(())
    }));
    settings.user_info_url = format!("http://127.0.0.1:{}/userinfo", oauth_port);
    settings.credentials_source = CredentialsSource::RawJson(raw_credentials);

    let attempt = begin_google_auth_flow(&settings).unwrap();
    (settings.open_browser)(attempt.auth_url()).unwrap();
    let callback_url = callback_rx.recv().unwrap();
    let result = complete_google_auth_flow(&store, &settings, attempt, &callback_url).unwrap();
    assert_eq!(result.name, "Integration User");
    assert_eq!(result.email, "integration@example.com");
    assert_eq!(result.avatar_url.as_deref(), Some(avatar_url.as_str()));
    assert!(result.avatar_base64.is_none());

    let active_id = store.get_active_profile_id().unwrap().unwrap();
    assert_eq!(active_id, result.id);

    let stored_profile = store.get_profile(&result.id).unwrap().unwrap();
    assert_eq!(stored_profile.email, "integration@example.com");
    assert_eq!(
        stored_profile.avatar_url.as_deref(),
        Some(avatar_url.as_str())
    );
    assert!(stored_profile.avatar_base64.is_none());

    server_handle.join().unwrap();
}

#[test]
#[serial]
fn new_only_policy_accepts_new_accounts_and_rejects_existing_accounts_in_browser() {
    let store = temp_store();

    let (created, success_page) = run_policy_flow(
        &store,
        AuthAccountPolicy::NewOnly,
        "new@example.com",
        "New User",
    );
    let created = created.unwrap();
    assert_eq!(created.email, "new@example.com");
    assert!(success_page.contains("Authentication Successful"));

    let (rejected, failure_page) = run_policy_flow(
        &store,
        AuthAccountPolicy::NewOnly,
        "new@example.com",
        "Changed Name",
    );
    assert!(
        matches!(rejected, Err(ProfileError::Auth(message)) if message == "Account already exists")
    );
    assert!(failure_page.contains("Account Already Added"));
    assert!(failure_page.contains("already connected to Squigit"));
    assert_eq!(store.profile_count().unwrap(), 1);
    assert_eq!(
        store.get_profile(&created.id).unwrap().unwrap().name,
        "New User"
    );
}

#[test]
#[serial]
fn existing_only_policy_accepts_saved_accounts_and_rejects_unknown_accounts_in_browser() {
    let store = temp_store();
    let existing = Profile::new_google(
        "https://accounts.google.com",
        "saved-subject",
        "saved@example.com",
        "Saved User",
        None,
        None,
    );
    store.upsert_profile(&existing).unwrap();

    let (logged_in, success_page) = run_policy_flow(
        &store,
        AuthAccountPolicy::ExistingOnly,
        "saved@example.com",
        "Refreshed User",
    );
    assert_eq!(logged_in.unwrap().id, existing.id);
    assert!(success_page.contains("Authentication Successful"));
    assert_eq!(
        store.get_profile(&existing.id).unwrap().unwrap().name,
        "Refreshed User"
    );

    let (rejected, failure_page) = run_policy_flow(
        &store,
        AuthAccountPolicy::ExistingOnly,
        "unknown@example.com",
        "Unknown User",
    );
    assert!(
        matches!(rejected, Err(ProfileError::Auth(message)) if message == "Account has not been added yet")
    );
    assert!(failure_page.contains("Account Not Found"));
    assert!(failure_page.contains("has not been added to Squigit"));
    assert_eq!(store.profile_count().unwrap(), 1);
    assert!(store
        .find_profile_by_identity("https://accounts.google.com", "unknown-subject")
        .unwrap()
        .is_none());
}

#[test]
#[serial]
fn stale_callback_state_is_rejected_without_writing_profiles() {
    let store = temp_store();
    let raw_credentials = r#"{
            "installed": {
                "client_id": "test-client.apps.googleusercontent.com",
                "client_secret": "test-secret",
                "auth_uri": "https://accounts.example.test/auth",
                "token_uri": "https://accounts.example.test/token"
            }
        }"#
    .to_string();

    let mut settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
    settings.credentials_source = CredentialsSource::RawJson(raw_credentials);

    let attempt = begin_google_auth_flow(&settings).unwrap();
    let callback_url = "org.squigit.app:/oauth2redirect/google?code=late-code&state=stale";
    let result = complete_google_auth_flow(&store, &settings, attempt, callback_url);
    assert!(
        matches!(result, Err(ProfileError::Auth(message)) if message == "OAuth callback state mismatch")
    );

    assert!(store.get_active_profile_id().unwrap().is_none());
    assert!(store.list_profiles().unwrap().is_empty());
}
