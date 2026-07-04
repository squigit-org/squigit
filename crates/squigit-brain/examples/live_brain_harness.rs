// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_auth::security::{
    encrypt_and_save_key, get_decrypted_key, validate_api_key, ApiKeyProvider,
};
use squigit_auth::{Profile, ProfileStore};
use squigit_brain::context::media::get_active_storage;
use squigit_brain::events::BrainEventSink;
use squigit_brain::provider::gemini::transport::types::GeminiEvent;
use squigit_brain::service::{AnalyzeImageRequest, BrainService, PromptChatRequest};
use std::env;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const API_KEY_ENV: &str = "GEMINI_API_KEY";
const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";
const LIVE_EMAIL: &str = "example@squigit.com";
const LIVE_NAME: &str = "Squigit Live Test";
const MODEL: &str = "models/gemini-flash-latest";

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let config_dir = isolated_config_dir()?;
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        return Err(
            "usage: cargo run -p squigit-brain --example live_brain_harness -- <analyze|prompt|chats> ..."
                .to_string(),
        );
    };

    match command.as_str() {
        "analyze" => {
            let image_path = args
                .next()
                .ok_or_else(|| "analyze requires <image_path>".to_string())?;
            let message = args.collect::<Vec<_>>().join(" ");
            let user_message = (!message.trim().is_empty()).then_some(message);
            prepare_live_profile(Some(&provider_api_key()?))?;
            let api_key = active_google_api_key()?;

            println!("[brain] handshaking with Gemini...");
            let sink = TerminalEventSink::default();
            let result = BrainService::new()
                .analyze_image(
                    &sink,
                    AnalyzeImageRequest {
                        api_key,
                        model: MODEL.to_string(),
                        image_path,
                        user_message,
                        channel_id: format!(
                            "live-brain-analyze-{}",
                            chrono::Utc::now().timestamp_millis()
                        ),
                        user_name: None,
                        user_email: None,
                        user_instruction: None,
                        ocr_lang: None,
                    },
                )
                .await?;

            println!("\n\nthread title: {}", result.metadata.title);
            println!("thread id: {}", result.metadata.id);
            println!("config: {}", config_dir.display());
        }
        "prompt" => {
            let chat_id = args
                .next()
                .ok_or_else(|| "prompt requires <thread_id> <message...>".to_string())?;
            let message = args.collect::<Vec<_>>().join(" ");
            if message.trim().is_empty() {
                return Err("prompt requires a non-empty message".to_string());
            }
            prepare_live_profile(Some(&provider_api_key()?))?;
            let api_key = active_google_api_key()?;

            println!("[brain] handshaking with Gemini...");
            let sink = TerminalEventSink::default();
            let result = BrainService::new()
                .prompt_chat(
                    &sink,
                    PromptChatRequest {
                        api_key,
                        model: MODEL.to_string(),
                        chat_id,
                        user_message: message,
                        channel_id: format!(
                            "live-brain-prompt-{}",
                            chrono::Utc::now().timestamp_millis()
                        ),
                        user_name: None,
                        user_email: None,
                    },
                )
                .await?;

            println!("\n\nthread id: {}", result.chat_id);
            println!("config: {}", config_dir.display());
        }
        "chats" => {
            prepare_live_profile(None)?;
            print_threads(&config_dir)?;
        }
        other => return Err(format!("unknown command: {other}")),
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

fn provider_api_key() -> Result<String, String> {
    normalize_provider_api_key(env::var(API_KEY_ENV).ok())
}

fn normalize_provider_api_key(value: Option<String>) -> Result<String, String> {
    let value = value.ok_or_else(|| format!("{API_KEY_ENV} is required for analyze and prompt"))?;
    let value = value.trim();
    if value.is_empty() {
        return Err(format!(
            "{API_KEY_ENV} must not be empty for analyze and prompt"
        ));
    }
    Ok(value.to_string())
}

fn prepare_live_profile(api_key: Option<&str>) -> Result<Profile, String> {
    let provider = ApiKeyProvider::GoogleAiStudio;
    if let Some(api_key) = api_key {
        if api_key.trim().is_empty() {
            return Err(format!("{API_KEY_ENV} must not be empty"));
        }
        validate_api_key(provider, api_key).map_err(|error| error.to_string())?;
    }

    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    bootstrap_live_profile(&store, api_key)
}

fn bootstrap_live_profile(store: &ProfileStore, api_key: Option<&str>) -> Result<Profile, String> {
    let profile = Profile::new(LIVE_EMAIL, LIVE_NAME, None, None);
    store
        .upsert_profile(&profile)
        .map_err(|error| error.to_string())?;
    store
        .set_active_profile_id(&profile.id)
        .map_err(|error| error.to_string())?;

    if let Some(api_key) = api_key {
        encrypt_and_save_key(store, &profile.id, ApiKeyProvider::GoogleAiStudio, api_key)
            .map_err(|error| error.to_string())?;
    }

    Ok(profile)
}

fn active_google_api_key() -> Result<String, String> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let active_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No active profile. Sign in first.".to_string())?;
    let key = get_decrypted_key(&store, ApiKeyProvider::GoogleAiStudio, &active_id)
        .map_err(|error| error.to_string())?
        .unwrap_or_default();

    if key.trim().is_empty() {
        return Err("Missing Google AI Studio API key for active profile.".to_string());
    }

    Ok(key)
}

fn print_threads(config_dir: &Path) -> Result<(), String> {
    let storage = get_active_storage()?;
    let mut chats = storage.list_chats().map_err(|error| error.to_string())?;
    chats.sort_by(|left, right| right.created_at.cmp(&left.created_at));

    println!("Temporary Threads");
    if chats.is_empty() {
        println!("\n  No temporary threads found.");
    } else {
        println!("\n{:<34} {:<20} Title", "ID", "Created (UTC)");
        for chat in chats {
            println!(
                "{:<34} {:<20} {}",
                chat.id,
                chat.created_at.format("%Y-%m-%d %H:%M:%S"),
                chat.title
            );
        }
    }
    println!("\nConfig: {}", config_dir.display());
    Ok(())
}

#[derive(Default)]
struct TerminalEventSink {
    output: Mutex<()>,
}

impl BrainEventSink for TerminalEventSink {
    fn emit(&self, _channel_id: &str, event: GeminiEvent) {
        let Ok(_guard) = self.output.lock() else {
            return;
        };

        match event {
            GeminiEvent::Token { token } => {
                print!("{token}");
                let _ = io::stdout().flush();
            }
            GeminiEvent::ToolStart { name, message, .. } => {
                println!("\n\u{1f527} {name}: {message}");
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn valid_test_key() -> String {
        format!("AIzaSy{}", "a".repeat(33))
    }

    #[test]
    fn api_key_is_required_and_trimmed() {
        assert!(normalize_provider_api_key(None).is_err());
        assert!(normalize_provider_api_key(Some("   ".to_string())).is_err());
        assert_eq!(
            normalize_provider_api_key(Some("  secret  ".to_string())).unwrap(),
            "secret"
        );
    }

    #[test]
    fn profile_bootstrap_is_idempotent_and_encrypts_the_key() {
        let directory = tempfile::tempdir().unwrap();
        let store = ProfileStore::with_base_dir(directory.path().join("Local Storage")).unwrap();
        let key = valid_test_key();

        let first = bootstrap_live_profile(&store, Some(&key)).unwrap();
        let second = bootstrap_live_profile(&store, Some(&key)).unwrap();

        assert_eq!(first.id, second.id);
        assert_eq!(store.profile_count().unwrap(), 1);
        assert_eq!(
            store.get_active_profile_id().unwrap().as_deref(),
            Some(first.id.as_str())
        );
        let stored_profile = store.get_profile(&first.id).unwrap().unwrap();
        assert_eq!(stored_profile.email, LIVE_EMAIL);
        assert_eq!(stored_profile.name, LIVE_NAME);
        assert!(stored_profile.avatar.is_none());
        assert!(stored_profile.original_avatar.is_none());

        let encrypted_path = store
            .get_provider_key_path(&first.id, ApiKeyProvider::GoogleAiStudio.storage_key_name());
        let encrypted = fs::read_to_string(encrypted_path).unwrap();
        assert!(!encrypted.contains(&key));
        assert_eq!(
            get_decrypted_key(&store, ApiKeyProvider::GoogleAiStudio, &first.id)
                .unwrap()
                .as_deref(),
            Some(key.as_str())
        );
    }
}
