// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::env;
use std::io::{self, Write};
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::sync::Arc;

use squigit_auth::ProfileError;
use squigit_auth::auth::{
    AuthFlowSettings, begin_google_auth_flow, complete_google_auth_flow,
    validate_google_credentials,
};
use squigit_auth::security::{ApiKeyProvider, encrypt_and_save_api_key, get_decrypted_key};
use squigit_storage::ProfileStore;

fn main() {
    if let Err(err) = run() {
        eprintln!("{}", err);
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        return Err(
            "usage: cargo run -p squigit-auth --example live_store_harness -- <command>"
                .to_string(),
        );
    };

    match command.as_str() {
        "store-base-dir" => {
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            println!("{}", store.base_dir().display());
        }
        "active-profile-id" => {
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            if let Some(profile_id) = store
                .get_active_profile_id()
                .map_err(|err| err.to_string())?
            {
                println!("{}", profile_id);
            }
        }
        "profile-id-for-identity" => {
            let issuer = args.next().ok_or_else(|| "missing issuer".to_string())?;
            let subject = args.next().ok_or_else(|| "missing subject".to_string())?;
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            let profile = store
                .find_profile_by_identity(&issuer, &subject)
                .map_err(|err| err.to_string())?
                .ok_or_else(|| {
                    format!(
                        "Profile not found for issuer '{}' and subject '{}'",
                        issuer, subject
                    )
                })?;
            println!("{}", profile.id);
        }
        "set-active-profile" => {
            let profile_id = args
                .next()
                .ok_or_else(|| "missing profile_id".to_string())?;
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            store
                .set_active_profile_id(&profile_id)
                .map_err(|err| err.to_string())?;
            println!("{}", profile_id);
        }
        "clear-active-profile" => {
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            store
                .clear_active_profile_id()
                .map_err(|err| err.to_string())?;
            println!("ok");
        }
        "delete-profile" => {
            let profile_id = args
                .next()
                .ok_or_else(|| "missing profile_id".to_string())?;
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            store
                .delete_profile(&profile_id)
                .map_err(|err| err.to_string())?;
            println!("{}", profile_id);
        }
        "list-profiles" => {
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            let profiles = store.list_profiles().map_err(|err| err.to_string())?;
            println!(
                "{}",
                serde_json::to_string(&profiles).map_err(|err| err.to_string())?
            );
        }
        "auth-google" => {
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            let settings =
                AuthFlowSettings::new(Arc::new(|url| open_url(url).map_err(ProfileError::Auth)));
            let attempt = begin_google_auth_flow(&settings).map_err(|err| err.to_string())?;
            (settings.open_browser)(attempt.auth_url()).map_err(|err| err.to_string())?;
            let callback_url = prompt_callback_url()?;
            let result = complete_google_auth_flow(&store, &settings, attempt, &callback_url)
                .map_err(|err| err.to_string());

            match result {
                Ok(payload) => {
                    println!(
                        "{}",
                        serde_json::to_string(&payload).map_err(|err| err.to_string())?
                    );
                }
                Err(err) => return Err(err),
            }
        }
        "auth-credentials-ok" => {
            let settings = AuthFlowSettings::new(Arc::new(|_| Ok(())));
            validate_google_credentials(&settings).map_err(|err| err.to_string())?;
            println!("ok");
        }
        "save-key" => {
            let profile_id = args
                .next()
                .ok_or_else(|| "missing profile_id".to_string())?;
            let provider = args.next().ok_or_else(|| "missing provider".to_string())?;
            let plaintext = args.next().ok_or_else(|| "missing plaintext".to_string())?;
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            let provider = ApiKeyProvider::from_str(&provider).map_err(|err| err.to_string())?;
            let path = encrypt_and_save_api_key(&store, &profile_id, provider, &plaintext)
                .map_err(|err| err.to_string())?;
            println!("{}", path);
        }
        "get-key" => {
            let profile_id = args
                .next()
                .ok_or_else(|| "missing profile_id".to_string())?;
            let provider = args.next().ok_or_else(|| "missing provider".to_string())?;
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            let provider = ApiKeyProvider::from_str(&provider).map_err(|err| err.to_string())?;
            if let Some(value) =
                get_decrypted_key(&store, provider, &profile_id).map_err(|err| err.to_string())?
            {
                println!("{}", value);
            }
        }
        other => {
            return Err(format!("unknown command: {}", other));
        }
    }

    Ok(())
}

fn prompt_callback_url() -> Result<String, String> {
    print!("Paste the final Google auth callback URL: ");
    io::stdout()
        .flush()
        .map_err(|err| format!("Failed to flush stdout: {err}"))?;

    let mut callback_url = String::new();
    io::stdin()
        .read_line(&mut callback_url)
        .map_err(|err| format!("Failed to read callback URL: {err}"))?;
    let callback_url = callback_url.trim().to_string();
    if callback_url.is_empty() {
        return Err("callback URL is required".to_string());
    }
    Ok(callback_url)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let command = ("xdg-open", vec![url.to_string()]);
    #[cfg(target_os = "macos")]
    let command = ("open", vec![url.to_string()]);
    #[cfg(target_os = "windows")]
    let command = (
        "rundll32",
        vec!["url.dll,FileProtocolHandler".to_string(), url.to_string()],
    );

    let output = Command::new(command.0)
        .args(&command.1)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|err| format!("Failed to open browser: {}", err))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(format!(
                "Browser opener exited with status {}",
                output.status
            ))
        } else {
            Err(format!(
                "Browser opener exited with status {}: {}",
                output.status, stderr
            ))
        }
    }
}
