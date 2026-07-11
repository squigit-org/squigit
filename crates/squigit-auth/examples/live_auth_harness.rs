// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use signal_hook::consts::{SIGINT, SIGTERM};
use signal_hook::flag;
use squigit_auth::auth::{start_google_auth_flow, AuthAccountPolicy, AuthFlowSettings};
use squigit_auth::{Profile, ProfileError, ProfileStore};
use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";
const DESKTOP_AUTH_PORT: u16 = 6062;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let config_dir = isolated_config_dir()?;
    let mut args = env::args().skip(1);
    let Some(action) = args.next() else {
        return Err(
            "usage: cargo run -p squigit-auth --example live_auth_harness -- <login|signup|logout|profiles|remove>"
                .to_string(),
        );
    };

    match action.as_str() {
        "login" | "signup" => {
            if args.next().is_some() {
                return Err(format!("{action} does not accept arguments"));
            }
            let policy = if action == "login" {
                AuthAccountPolicy::ExistingOnly
            } else {
                AuthAccountPolicy::NewOnly
            };
            run_google_auth(policy)?;
        }
        "logout" => {
            if args.next().is_some() {
                return Err("logout does not accept arguments".to_string());
            }
            let store = ProfileStore::new().map_err(|error| error.to_string())?;
            logout(&store)?;
            println!("Logged out. Temporary profiles were preserved.");
            println!("Config: {}", config_dir.display());
        }
        "profiles" => {
            if args.next().is_some() {
                return Err("profiles does not accept arguments".to_string());
            }
            let store = ProfileStore::new().map_err(|error| error.to_string())?;
            print_profiles(&store)?;
            println!("\nConfig: {}", config_dir.display());
        }
        "remove" => {
            let subject = args
                .next()
                .ok_or_else(|| "remove requires <id-or-email>".to_string())?;
            if args.next().is_some() {
                return Err("remove accepts exactly one <id-or-email>".to_string());
            }
            let store = ProfileStore::new().map_err(|error| error.to_string())?;
            let removed = remove_profile(&store, &subject)?;
            println!("Removed {} ({}).", removed.email, removed.id);
            println!("Config: {}", config_dir.display());
        }
        other => return Err(format!("unknown live auth action: {other}")),
    }

    Ok(())
}

fn isolated_config_dir() -> Result<PathBuf, String> {
    let path = env::var_os(CONFIG_DIR_ENV)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| {
            format!("{CONFIG_DIR_ENV} is required so the live harness cannot use app data")
        })?;
    if !path.is_absolute() {
        return Err(format!("{CONFIG_DIR_ENV} must be an absolute path"));
    }
    Ok(path)
}

fn run_google_auth(policy: AuthAccountPolicy) -> Result<(), String> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let mut settings =
        AuthFlowSettings::new(Arc::new(|url| open_system_browser(url).map_err(ProfileError::Auth)));
    settings.redirect_port = DESKTOP_AUTH_PORT;
    settings.account_policy = policy;

    let auth_cancelled = Arc::new(AtomicBool::new(false));
    install_cancel_signal_handlers(auth_cancelled.clone())?;
    let cancel_notifier = spawn_cancel_notifier(settings.cancel_url(), auth_cancelled.clone());

    println!("[auth] Complete the Google flow in your browser.");
    let result = start_google_auth_flow(&store, &settings, auth_cancelled)
        .map(|_| ())
        .map_err(|error| error.to_string());
    cancel_notifier.store(true, Ordering::SeqCst);
    result
}

fn logout(store: &ProfileStore) -> Result<(), String> {
    store
        .clear_active_profile_id()
        .map_err(|error| error.to_string())
}

fn remove_profile(store: &ProfileStore, subject: &str) -> Result<Profile, String> {
    let profile = resolve_profile(store, subject)?;
    let active_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?;
    if active_id.as_deref() == Some(profile.id.as_str()) {
        return Err(
            "Cannot remove the active profile. Log out or add another account first.".to_string(),
        );
    }

    store
        .delete_profile(&profile.id)
        .map_err(|error| error.to_string())?;
    Ok(profile)
}

fn resolve_profile(store: &ProfileStore, subject: &str) -> Result<Profile, String> {
    let subject = subject.trim();
    if subject.is_empty() {
        return Err("remove requires a non-empty <id-or-email>".to_string());
    }

    if let Some(profile) = store
        .get_profile(subject)
        .map_err(|error| error.to_string())?
    {
        return Ok(profile);
    }
    if let Some(profile) = store
        .find_profile_by_email(subject)
        .map_err(|error| error.to_string())?
    {
        return Ok(profile);
    }

    Err(format!("No temporary profile found for '{subject}'."))
}

fn print_profiles(store: &ProfileStore) -> Result<(), String> {
    let profiles = store.list_profiles().map_err(|error| error.to_string())?;
    let active_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?;

    println!("Temporary Auth Profiles");
    if profiles.is_empty() {
        println!("\n  No temporary profiles found.");
        return Ok(());
    }

    println!("\n{:<18} {:<32} {:<26} Status", "ID", "Email", "Name");
    for profile in profiles {
        let status = if active_id.as_deref() == Some(profile.id.as_str()) {
            "active"
        } else {
            "inactive"
        };
        println!(
            "{:<18} {:<32} {:<26} {status}",
            profile.id, profile.email, profile.name
        );
    }
    Ok(())
}

fn install_cancel_signal_handlers(cancelled: Arc<AtomicBool>) -> Result<(), String> {
    flag::register(SIGINT, cancelled.clone())
        .map_err(|error| format!("Failed to register SIGINT handler: {error}"))?;
    flag::register(SIGTERM, cancelled)
        .map_err(|error| format!("Failed to register SIGTERM handler: {error}"))?;
    Ok(())
}

fn spawn_cancel_notifier(cancel_url: String, cancelled: Arc<AtomicBool>) -> Arc<AtomicBool> {
    let shutdown = Arc::new(AtomicBool::new(false));
    let thread_shutdown = shutdown.clone();
    thread::spawn(move || {
        let client = reqwest::blocking::Client::new();
        let mut request_sent = false;
        while !thread_shutdown.load(Ordering::SeqCst) {
            if cancelled.load(Ordering::SeqCst) && !request_sent {
                let _ = client.get(&cancel_url).send();
                request_sent = true;
            }
            thread::sleep(Duration::from_millis(50));
        }
    });
    shutdown
}

#[cfg(target_os = "linux")]
fn open_system_browser(url: &str) -> Result<(), String> {
    let mut command = Command::new("xdg-open");
    command
        .arg(url)
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("ELECTRON_RUN_AS_NODE")
        .env_remove("GIO_EXTRA_MODULES");
    spawn_browser(command)
}

#[cfg(target_os = "macos")]
fn open_system_browser(url: &str) -> Result<(), String> {
    let mut command = Command::new("open");
    command.arg(url);
    spawn_browser(command)
}

#[cfg(target_os = "windows")]
fn open_system_browser(url: &str) -> Result<(), String> {
    let mut command = Command::new("rundll32");
    command.args(["url.dll,FileProtocolHandler", url]);
    spawn_browser(command)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn open_system_browser(_url: &str) -> Result<(), String> {
    Err("Opening the OAuth browser is unsupported on this operating system".to_string())
}

fn spawn_browser(mut command: Command) -> Result<(), String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open the system browser: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with_profiles() -> (tempfile::TempDir, ProfileStore, Profile, Profile) {
        let directory = tempfile::tempdir().unwrap();
        let store = ProfileStore::with_base_dir(directory.path().to_path_buf()).unwrap();
        let first = Profile::new("first@example.com", "First User", None, None);
        let second = Profile::new("second@example.com", "Second User", None, None);
        store.upsert_profile(&first).unwrap();
        store.upsert_profile(&second).unwrap();
        store.set_active_profile_id(&second.id).unwrap();
        (directory, store, first, second)
    }

    #[test]
    fn logout_clears_only_the_active_profile() {
        let (_directory, store, first, second) = store_with_profiles();

        logout(&store).unwrap();

        assert!(store.get_active_profile_id().unwrap().is_none());
        assert!(store.get_profile(&first.id).unwrap().is_some());
        assert!(store.get_profile(&second.id).unwrap().is_some());
    }

    #[test]
    fn profile_resolution_accepts_id_and_case_insensitive_email() {
        let (_directory, store, first, _second) = store_with_profiles();

        assert_eq!(resolve_profile(&store, &first.id).unwrap().id, first.id);
        assert_eq!(
            resolve_profile(&store, "FIRST@EXAMPLE.COM").unwrap().id,
            first.id
        );
    }

    #[test]
    fn removal_rejects_active_and_preserves_it_when_removing_inactive() {
        let (_directory, store, first, second) = store_with_profiles();

        assert!(remove_profile(&store, &second.id).is_err());
        let removed = remove_profile(&store, &first.email).unwrap();

        assert_eq!(removed.id, first.id);
        assert!(store.get_profile(&first.id).unwrap().is_none());
        assert_eq!(
            store.get_active_profile_id().unwrap().as_deref(),
            Some(second.id.as_str())
        );
    }

    #[test]
    fn removal_preserves_the_final_profile_invariant() {
        let directory = tempfile::tempdir().unwrap();
        let store = ProfileStore::with_base_dir(directory.path().to_path_buf()).unwrap();
        let profile = Profile::new("only@example.com", "Only User", None, None);
        store.upsert_profile(&profile).unwrap();
        logout(&store).unwrap();

        let error = remove_profile(&store, &profile.id).unwrap_err();

        assert!(error.contains("Cannot delete the last profile"));
        assert!(store.get_profile(&profile.id).unwrap().is_some());
    }
}
