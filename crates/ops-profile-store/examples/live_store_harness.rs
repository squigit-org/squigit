// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::env;
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

use ops_profile_store::auth::{
    start_google_auth_flow, validate_google_credentials, AuthFlowSettings,
};
use ops_profile_store::security::{encrypt_and_save_key, get_decrypted_key, ApiKeyProvider};
use ops_profile_store::{ProfileError, ProfileStore};
use signal_hook::consts::{SIGINT, SIGTERM};
use signal_hook::flag;

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
            "usage: cargo run -p ops-profile-store --example live_store_harness -- <command>"
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
        "profile-id-for-email" => {
            let email = args.next().ok_or_else(|| "missing email".to_string())?;
            let store = ProfileStore::new().map_err(|err| err.to_string())?;
            let profile = store
                .find_profile_by_email(&email)
                .map_err(|err| err.to_string())?
                .ok_or_else(|| format!("Profile not found for email: {}", email))?;
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
            let settings = AuthFlowSettings::new(
                "Squigit",
                Arc::new(|url| open_url(url).map_err(ProfileError::Auth)),
            );
            let auth_cancelled = Arc::new(AtomicBool::new(false));
            install_cancel_signal_handlers(auth_cancelled.clone())?;
            let cancel_notifier =
                spawn_cancel_notifier(settings.cancel_url(), auth_cancelled.clone());

            let result = start_google_auth_flow(&store, &settings, auth_cancelled)
                .map_err(|err| err.to_string());
            cancel_notifier.store(true, Ordering::SeqCst);

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
            let settings = AuthFlowSettings::new("Squigit", Arc::new(|_| Ok(())));
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
            let path = encrypt_and_save_key(&store, &profile_id, provider, &plaintext)
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

fn install_cancel_signal_handlers(cancelled: Arc<AtomicBool>) -> Result<(), String> {
    flag::register(SIGINT, cancelled.clone())
        .map_err(|err| format!("Failed to register SIGINT handler: {}", err))?;
    flag::register(SIGTERM, cancelled)
        .map_err(|err| format!("Failed to register SIGTERM handler: {}", err))?;
    Ok(())
}

fn spawn_cancel_notifier(cancel_url: String, cancelled: Arc<AtomicBool>) -> Arc<AtomicBool> {
    let notifier_shutdown = Arc::new(AtomicBool::new(false));
    let notifier_shutdown_for_thread = notifier_shutdown.clone();

    thread::spawn(move || {
        let client = reqwest::blocking::Client::new();
        let mut request_sent = false;

        while !notifier_shutdown_for_thread.load(Ordering::SeqCst) {
            if cancelled.load(Ordering::SeqCst) && !request_sent {
                let _ = client.get(&cancel_url).send();
                request_sent = true;
            }

            thread::sleep(Duration::from_millis(50));
        }
    });

    notifier_shutdown
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
