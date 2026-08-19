// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use rand::Rng;
use squigit_auth::{
    check_reveal_authorization, encrypt_and_save_api_key, get_api_key_status,
    get_decrypted_api_key, object_remote_id, reveal_api_key, validate_api_key,
    ApiKeyProvider, RevealAuthResult, RevealShell,
};
use squigit_brain::{
    AttachmentPreparationStatus, BrainService, ModelDiscoveryQueues, PrepareAttachmentRequest,
};
use squigit_storage::{AttachmentFileType, ObjectRemote, Profile, ProfileStore, ThreadStorage};
use std::collections::BTreeMap;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const API_KEY_ENV: &str = "GEMINI_API_KEY";
const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";
const LIVE_API_ISSUER: &str = "https://accounts.google.com";
const LIVE_API_SUBJECT: &str = "squigit-live-apis";
const LIVE_API_EMAIL: &str = "apis-live@squigit.local";
const LIVE_API_NAME: &str = "Squigit Live APIs";
const REMOTES_FILE: &str = "object-remotes.json";

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let action = args.next().ok_or_else(|| {
        "usage: cargo run -p squigit-auth --example live_apis_harness -- <save|reveal|models|upload>"
            .to_string()
    })?;
    if args.next().is_some() {
        return Err(format!("{action} does not accept arguments"));
    }
    match action.as_str() {
        "save" => run_save(),
        "reveal" => run_reveal(),
        "models" => run_models().await,
        "upload" => run_upload().await,
        other => Err(format!("unknown live APIs action: {other}")),
    }
}

fn run_save() -> Result<(), String> {
    let config_dir = isolated_config_dir()?;
    let api_key = required_api_key()?;
    let provider = ApiKeyProvider::GoogleAiStudio;
    validate_api_key(provider, &api_key).map_err(|error| error.to_string())?;

    let store =
        ProfileStore::with_base_dir(config_dir.clone()).map_err(|error| error.to_string())?;
    let profile = active_or_live_profile(&store)?;
    encrypt_and_save_api_key(&store, &profile.id, provider, &api_key)
        .map_err(|error| error.to_string())?;
    if !get_api_key_status(&store, provider, &profile.id).map_err(|error| error.to_string())? {
        return Err("credential-unavailable: save did not create a key record".to_string());
    }
    let revealed = get_decrypted_api_key(&store, provider, &profile.id)
        .map_err(|error| error.to_string())?
        .map(|credential| credential.api_key)
        .ok_or_else(|| "credential-unavailable: save could not be decrypted".to_string())?;
    if revealed.expose() != api_key {
        return Err("credential-roundtrip-failed: decrypted key did not match input".to_string());
    }

    let keys_path = config_dir.join("keys.json");
    let lock_path = config_dir.join("keys.lock");
    if !keys_path.is_file() || !lock_path.is_file() {
        return Err("save did not create keys.json and keys.lock".to_string());
    }
    println!("Gemini API key encrypted and stored.");
    println!("  isolated profile: {}", profile.id);
    println!("  decryption: verified");
    println!("  key store: {}", keys_path.display());
    println!("  lock file: {}", lock_path.display());
    println!("  config directory: {}", config_dir.display());
    Ok(())
}

fn run_reveal() -> Result<(), String> {
    let config_dir = isolated_config_dir()?;
    let store =
        ProfileStore::with_base_dir(config_dir.clone()).map_err(|error| error.to_string())?;
    let profile = active_profile(&store)?;

    match check_reveal_authorization(&store, RevealShell::Cli)
        .map_err(|error| error.to_string())?
    {
        RevealAuthResult::Authorized => {
            println!("Grace period active, skipping PIN.");
        }
        RevealAuthResult::RequiresTerminalPin => {
            prompt_terminal_pin()?;
        }
        _ => {
            return Err("vault-denied: unexpected auth type for CLI shell".to_string());
        }
    }

    store
        .update_last_trusted_reveal()
        .map_err(|error| error.to_string())?;
    let secret = reveal_api_key(&store, ApiKeyProvider::GoogleAiStudio, &profile.id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            "credential-unavailable: Google AI Studio key is not configured".to_string()
        })?;
    println!("\n{}", secret.expose());
    println!(
        "\nReveal passed for isolated config: {}",
        config_dir.display()
    );
    Ok(())
}

fn prompt_terminal_pin() -> Result<(), String> {
    let pin = rand::thread_rng().gen_range(100_000..=999_999).to_string();
    println!("Terminal reveal PIN: {pin}");
    let entered = rpassword::prompt_password("PIN: ")
        .map_err(|error| format!("Could not read terminal PIN: {error}"))?;
    if entered.trim() != pin {
        return Err("vault-denied: terminal PIN did not match".to_string());
    }
    Ok(())
}

async fn run_models() -> Result<(), String> {
    let config_dir = isolated_config_dir()?;
    let store =
        ProfileStore::with_base_dir(config_dir.clone()).map_err(|error| error.to_string())?;
    let profile = active_profile(&store)?;
    let queues = BrainService::new()
        .discover_provider_models(
            profile.id,
            ApiKeyProvider::GoogleAiStudio
                .storage_key_name()
                .to_string(),
        )
        .await?;
    print_model_queues(&queues)?;
    println!("Config: {}", config_dir.display());
    Ok(())
}

async fn run_upload() -> Result<(), String> {
    let config_dir = isolated_config_dir()?;
    let store =
        ProfileStore::with_base_dir(config_dir.clone()).map_err(|error| error.to_string())?;
    let profile = active_profile(&store)?;
    let credential = reveal_api_key(&store, ApiKeyProvider::GoogleAiStudio, &profile.id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            "credential-unavailable: run `cargo xtask live apis save` first".to_string()
        })?;
    let asset = test_asset();
    if !asset.is_file() {
        return Err(format!("Live API asset is missing: {}", asset.display()));
    }
    let asset_bytes = fs::read(&asset).map_err(|error| error.to_string())?;
    let object_hash = blake3::hash(&asset_bytes).to_hex().to_string();
    let storage =
        ThreadStorage::with_config_root(config_dir.clone()).map_err(|error| error.to_string())?;
    let current_remote_id =
        object_remote_id(ApiKeyProvider::GoogleAiStudio, &object_hash, &credential)
            .map_err(|error| error.to_string())?;
    let before_remotes = storage
        .load_object_manifest(&object_hash)
        .map(|manifest| manifest.object_remotes)
        .unwrap_or_default();
    let before_current = before_remotes.get(&current_remote_id).cloned();
    let now = chrono::Utc::now();
    let expected_disposition = if before_current
        .as_ref()
        .is_some_and(|remote| remote.expires_at > now)
    {
        "remote-reused"
    } else {
        "remote-uploaded"
    };
    let retained_remote_ids = before_remotes
        .iter()
        .filter(|(_, remote)| remote.expires_at > now)
        .map(|(remote_id, _)| remote_id.clone())
        .collect::<Vec<_>>();

    let result = BrainService::new()
        .prepare_attachment(PrepareAttachmentRequest {
            job_id: format!("live-file-api-{}", chrono::Utc::now().timestamp_millis()),
            source_path: asset.to_string_lossy().into_owned(),
        })
        .await;
    if result.status != AttachmentPreparationStatus::Ready {
        return Err(format!(
            "{}: {}",
            result.error_code.as_deref().unwrap_or("file-api-failed"),
            result
                .error_message
                .as_deref()
                .unwrap_or("Gemini file preparation failed")
        ));
    }
    if result.file_type != Some(AttachmentFileType::ImageUpload) {
        return Err("file API asset did not produce an image upload".to_string());
    }
    let prepared_hash = result
        .attachment_hash
        .ok_or_else(|| "file API upload returned no CAS hash".to_string())?;
    if prepared_hash != object_hash {
        return Err("file API preparation changed the fixed asset hash".to_string());
    }
    if result.disposition.as_deref() != Some(expected_disposition) {
        return Err(format!(
            "expected {expected_disposition}, got {}",
            result.disposition.as_deref().unwrap_or("none")
        ));
    }
    let manifest = storage
        .load_object_manifest(&object_hash)
        .map_err(|error| error.to_string())?;
    let current_remote = manifest
        .object_remotes
        .get(&current_remote_id)
        .ok_or_else(|| "manifest is missing the current API credential remote".to_string())?;
    for remote_id in &retained_remote_ids {
        if !manifest.object_remotes.contains_key(remote_id) {
            return Err("file API lifecycle discarded an unexpired credential remote".to_string());
        }
    }
    if let Some(previous) = before_current {
        if expected_disposition == "remote-reused" {
            if current_remote.file_uri != previous.file_uri
                || current_remote.file_name != previous.file_name
                || current_remote.uploaded_at != previous.uploaded_at
                || current_remote.expires_at != previous.expires_at
            {
                return Err("remote reuse replaced the unexpired Gemini resource".to_string());
            }
        } else if current_remote.uploaded_at <= previous.uploaded_at {
            return Err("expired remote was not replaced by a newer upload".to_string());
        }
    }

    let remotes_path = config_dir.join(REMOTES_FILE);
    write_remote_snapshot(&remotes_path, &manifest.object_remotes)?;
    let persisted = read_remote_snapshot(&remotes_path)?;
    if persisted != manifest.object_remotes {
        return Err("standalone object-remotes JSON differs from the CAS manifest".to_string());
    }
    let json = serde_json::to_string_pretty(&persisted).map_err(|error| error.to_string())?;
    println!("{json}");
    println!("\nFile API lifecycle passed.");
    println!(
        "  disposition: {}",
        result.disposition.as_deref().unwrap_or("ready")
    );
    println!("  remotes: {}", persisted.len());
    println!("  file: {}", asset.display());
    println!("  path: {}", remotes_path.display());
    Ok(())
}

fn isolated_config_dir() -> Result<PathBuf, String> {
    let path = env::var_os(CONFIG_DIR_ENV)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| {
            format!("{CONFIG_DIR_ENV} is required so the live suite cannot use app data")
        })?;
    if !path.is_absolute() {
        return Err(format!("{CONFIG_DIR_ENV} must be an absolute path"));
    }
    if squigit_storage::paths::is_default_app_config_dir(&path) {
        return Err(format!(
            "{CONFIG_DIR_ENV} must not be the installed application config directory"
        ));
    }
    Ok(path)
}

fn required_api_key() -> Result<String, String> {
    let key = env::var(API_KEY_ENV).map_err(|_| format!("{API_KEY_ENV} is required"))?;
    let key = key.trim();
    if key.is_empty() {
        return Err(format!("{API_KEY_ENV} must not be empty"));
    }
    Ok(key.to_string())
}

fn active_or_live_profile(store: &ProfileStore) -> Result<Profile, String> {
    if let Some(profile) = store
        .get_active_profile()
        .map_err(|error| error.to_string())?
    {
        return Ok(profile);
    }
    let profile = Profile::new_google(
        LIVE_API_ISSUER,
        LIVE_API_SUBJECT,
        LIVE_API_EMAIL,
        LIVE_API_NAME,
        None,
        None,
    );
    store
        .upsert_profile(&profile)
        .map_err(|error| error.to_string())?;
    store
        .set_active_profile_id(&profile.id)
        .map_err(|error| error.to_string())?;
    Ok(profile)
}

fn active_profile(store: &ProfileStore) -> Result<Profile, String> {
    store
        .get_active_profile()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "credential-unavailable: run `cargo xtask live apis save` first".to_string())
}

fn test_asset() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("examples/assets/test-fileapi.png")
}

fn print_model_queues(queues: &ModelDiscoveryQueues) -> Result<(), String> {
    let json = serde_json::to_string_pretty(queues).map_err(|error| error.to_string())?;
    println!("{json}");
    Ok(())
}

fn write_remote_snapshot(
    path: &Path,
    remotes: &BTreeMap<String, ObjectRemote>,
) -> Result<(), String> {
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink() || !metadata.file_type().is_file())
    {
        return Err(format!(
            "Refusing non-regular object-remotes target: {}",
            path.display()
        ));
    }
    let json = serde_json::to_vec_pretty(remotes).map_err(|error| error.to_string())?;
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|error| error.to_string())?;
    file.write_all(&json).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn read_remote_snapshot(path: &Path) -> Result<BTreeMap<String, ObjectRemote>, String> {
    let json = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&json).map_err(|error| error.to_string())
}
