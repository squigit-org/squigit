// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_auth::auth::{
    begin_google_auth_flow, complete_google_auth_flow, AuthAccountPolicy, AuthFlowSettings,
};
use squigit_auth::{Profile, ProfileError, ProfileStore};
use std::env;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;

const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";

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
            let profile_id = args
                .next()
                .ok_or_else(|| "remove requires <profile-id>".to_string())?;
            if args.next().is_some() {
                return Err("remove accepts exactly one <profile-id>".to_string());
            }
            let store = ProfileStore::new().map_err(|error| error.to_string())?;
            let removed = remove_profile(&store, &profile_id)?;
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
    let mut settings = AuthFlowSettings::new(Arc::new(|url| {
        open_system_browser(url).map_err(ProfileError::Auth)
    }));
    settings.account_policy = policy;

    println!("[auth] Complete the Google flow in your browser.");
    let attempt = begin_google_auth_flow(&settings).map_err(|error| error.to_string())?;
    (settings.open_browser)(attempt.auth_url()).map_err(|error| error.to_string())?;
    let callback_url = prompt_callback_url()?;
    complete_google_auth_flow(&store, &settings, attempt, &callback_url)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn logout(store: &ProfileStore) -> Result<(), String> {
    store
        .clear_active_profile_id()
        .map_err(|error| error.to_string())
}

fn remove_profile(store: &ProfileStore, profile_id: &str) -> Result<Profile, String> {
    let profile = resolve_profile(store, profile_id)?;
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

fn resolve_profile(store: &ProfileStore, profile_id: &str) -> Result<Profile, String> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty() {
        return Err("remove requires a non-empty <profile-id>".to_string());
    }

    if let Some(profile) = store
        .get_profile(profile_id)
        .map_err(|error| error.to_string())?
    {
        return Ok(profile);
    }

    Err(format!("No temporary profile found for '{profile_id}'."))
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

fn prompt_callback_url() -> Result<String, String> {
    print!("Paste the final Google auth callback URL: ");
    io::stdout()
        .flush()
        .map_err(|error| format!("Failed to flush stdout: {error}"))?;

    let mut callback_url = String::new();
    io::stdin()
        .read_line(&mut callback_url)
        .map_err(|error| format!("Failed to read callback URL: {error}"))?;
    let callback_url = callback_url.trim().to_string();
    if callback_url.is_empty() {
        return Err("callback URL is required".to_string());
    }
    Ok(callback_url)
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

    fn test_profile(subject: &str, email: &str, name: &str) -> Profile {
        Profile::new_google(
            "https://accounts.google.com",
            subject,
            email,
            name,
            None,
            None,
        )
    }

    fn store_with_profiles() -> (tempfile::TempDir, ProfileStore, Profile, Profile) {
        let directory = tempfile::tempdir().unwrap();
        let store = ProfileStore::with_base_dir(directory.path().to_path_buf()).unwrap();
        let first = test_profile("subject-1", "first@example.com", "First User");
        let second = test_profile("subject-2", "second@example.com", "Second User");
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
    fn profile_resolution_accepts_id_only() {
        let (_directory, store, first, _second) = store_with_profiles();

        assert_eq!(resolve_profile(&store, &first.id).unwrap().id, first.id);
        assert!(resolve_profile(&store, "FIRST@EXAMPLE.COM").is_err());
    }

    #[test]
    fn removal_rejects_active_and_preserves_it_when_removing_inactive() {
        let (_directory, store, first, second) = store_with_profiles();

        assert!(remove_profile(&store, &second.id).is_err());
        let removed = remove_profile(&store, &first.id).unwrap();

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
        let profile = test_profile("subject-only", "only@example.com", "Only User");
        store.upsert_profile(&profile).unwrap();
        logout(&store).unwrap();

        let error = remove_profile(&store, &profile.id).unwrap_err();

        assert!(error.contains("Cannot delete the last profile"));
        assert!(store.get_profile(&profile.id).unwrap().is_some());
    }
}
