// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Response, Server};
use url::Url;

use ops_profile_store::{Profile, ProfileStore};

const SECRETS_JSON: &str = include_str!("../data/credentials.json");

const HTML_TEMPLATE: &str = include_str!("../data/success.html");

const REDIRECT_PORT: u16 = 3000;
const REDIRECT_URI: &str = "http://localhost:3000";
const USER_INFO_URL: &str =
    "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos";

#[derive(Deserialize, Debug)]
struct GoogleCredentials {
    installed: Option<OAuthConfig>,
    web: Option<OAuthConfig>,
}

#[derive(Deserialize, Debug, Clone)]
struct OAuthConfig {
    client_id: String,
    client_secret: String,
    auth_uri: String,
    token_uri: String,
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

#[derive(Serialize, Clone)]
struct SavedProfile {
    id: String,
    name: String,
    email: String,
    avatar: String,
    original_picture: Option<String>,
}

pub fn start_google_auth_flow(app: AppHandle, config_dir: PathBuf) -> Result<(), String> {
    let wrapper: GoogleCredentials = serde_json::from_str(SECRETS_JSON)
        .map_err(|e| format!("Failed to parse credentials.json: {}", e))?;

    let secrets = wrapper
        .installed
        .or(wrapper.web)
        .ok_or("Invalid credentials.json: missing 'installed' or 'web' object")?;

    let server = Server::http(format!("127.0.0.1:{}", REDIRECT_PORT)).map_err(|e| {
        format!(
            "Failed to start auth server on port {}: {}",
            REDIRECT_PORT, e
        )
    })?;

    let auth_url_full = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=profile email&access_type=offline&prompt=consent",
        secrets.auth_uri, secrets.client_id, REDIRECT_URI
    );

    crate::utils::open_url(&auth_url_full).map_err(|e| e.to_string())?;

    loop {
        let request = match server.recv() {
            Ok(rq) => rq,
            Err(e) => {
                println!("Server receive error: {}", e);
                break;
            }
        };

        let url_string = format!("http://localhost:{}{}", REDIRECT_PORT, request.url());

        if url_string.contains("favicon.ico") {
            let _ = request.respond(Response::empty(404));
            continue;
        }

        let url = Url::parse(&url_string).map_err(|_| "Failed to parse callback URL")?;
        let code_pair = url.query_pairs().find(|(key, _)| key == "code");

        if let Some((_, code)) = code_pair {
            let client = reqwest::blocking::Client::new();
            let token_res = client
                .post(&secrets.token_uri)
                .form(&[
                    ("client_id", &secrets.client_id),
                    ("client_secret", &secrets.client_secret),
                    ("code", &code.to_string()),
                    ("grant_type", &"authorization_code".to_string()),
                    ("redirect_uri", &REDIRECT_URI.to_string()),
                ])
                .send()
                .map_err(|e| format!("Token Exchange Failed: {}", e))?;

            if !token_res.status().is_success() {
                return respond_html(
                    request,
                    "Auth Failed",
                    "Google refused the code exchange.",
                    true,
                );
            }

            let token_data: TokenResponse = token_res.json().map_err(|e| e.to_string())?;

            let profile_res = client
                .get(USER_INFO_URL)
                .bearer_auth(token_data.access_token)
                .send()
                .map_err(|e| format!("Profile Fetch Failed: {}", e))?;

            let profile: UserProfile = profile_res.json().map_err(|e| e.to_string())?;

            let name = profile
                .names
                .and_then(|n| n.first().and_then(|x| x.display_name.clone()))
                .unwrap_or("SnapLLM User".to_string());
            let email = profile
                .email_addresses
                .and_then(|e| e.first().and_then(|x| x.value.clone()))
                .unwrap_or_default();

            let mut avatar = profile
                .photos
                .and_then(|p| p.first().and_then(|x| x.url.clone()))
                .unwrap_or_default();
            
            let original_picture = if !avatar.is_empty() {
                Some(avatar.clone())
            } else {
                None
            };
            
            // Generate profile ID from email
            let profile_id = Profile::id_from_email(&email);

            // Try to download and save the avatar locally
            let mut local_avatar = String::new();
            if !avatar.is_empty() {
                // Ensure https
                if avatar.starts_with("http://") {
                    avatar = avatar.replace("http://", "https://");
                }
                
                // Get profile store and create profile's chats dir for CAS
                if let Ok(profile_store) = ProfileStore::new() {
                    let chats_dir = profile_store.get_chats_dir(&profile_id);
                    if let Ok(storage) = ops_chat_storage::ChatStorage::with_base_dir(chats_dir) {
                        // Download and save to CAS
                        if let Ok(response) = client.get(&avatar).send() {
                            if let Ok(bytes) = response.bytes() {
                                if let Ok(stored_image) = storage.store_image(&bytes) {
                                    local_avatar = stored_image.path;
                                }
                            }
                        }
                    }
                }
            }

            // Create and save profile using ops-profile-store
            let profile = Profile::new(
                &email,
                &name,
                if local_avatar.is_empty() { None } else { Some(local_avatar.clone()) },
                original_picture.clone(),
            );

            let profile_store = ProfileStore::new().map_err(|e| e.to_string())?;
            profile_store.upsert_profile(&profile).map_err(|e| e.to_string())?;
            profile_store.set_active_profile_id(&profile.id).map_err(|e| e.to_string())?;

            // Build response data for frontend
            let user_data = SavedProfile {
                id: profile.id.clone(),
                name: profile.name.clone(),
                email: profile.email.clone(),
                avatar: local_avatar,
                original_picture,
            };

            let _ = app.emit("auth-success", &user_data);

            let _ = respond_html(
                request,
                "Authentication Successful",
                "<p>SnapLLM is now connected to your Google Account.</p><p>You can close this tab.</p>",
                false,
            );

            return Ok(());
        } else {
            let _ = respond_html(
                request,
                "Authentication Failed",
                "No authorization code found.",
                true,
            );

            return Ok(());
        }
    }

    Ok(())
}

fn respond_html(
    request: tiny_http::Request,
    title: &str,
    content: &str,
    is_error: bool,
) -> Result<(), String> {
    let title_color = if is_error { "#d93025" } else { "#202124" };
    let breadcrumb = if is_error { "Error" } else { "Confirmation" };

    let dynamic_style = format!("<style>:root {{ --title-color: {}; }}</style>", title_color);

    let html = HTML_TEMPLATE
        .replace("${title}", title)
        .replace("${dynamicStyle}", &dynamic_style)
        .replace("${breadcrumb}", breadcrumb)
        .replace("${bodyContent}", content);

    let response = Response::from_string(html).with_header(
        Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap(),
    );

    request.respond(response).map_err(|e| e.to_string())
}
