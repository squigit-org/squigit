// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;

use squigit_auth::security::{
    encrypt_and_save_api_key_with_vault, get_decrypted_api_key_with_vault, ApiKeyProvider,
    SecretVault, VaultKey,
};
use squigit_auth::Result;
use squigit_storage::{Profile, ProfileStore};
use tempfile::tempdir;

#[derive(Default)]
struct MemoryVault {
    values: Mutex<HashMap<String, Vec<u8>>>,
}

impl SecretVault for MemoryVault {
    fn get(&self, account: &str) -> Result<Option<VaultKey>> {
        self.values
            .lock()
            .unwrap()
            .get(account)
            .cloned()
            .map(VaultKey::from_bytes)
            .transpose()
    }

    fn set(&self, account: &str, secret: &[u8; 32]) -> Result<()> {
        self.values
            .lock()
            .unwrap()
            .insert(account.to_owned(), secret.to_vec());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<()> {
        self.values.lock().unwrap().remove(account);
        Ok(())
    }
}

fn temp_store() -> ProfileStore {
    let temp_dir = tempdir().unwrap();
    let root = temp_dir.path().to_path_buf();
    std::mem::forget(temp_dir);
    let store = ProfileStore::with_base_dir(root).unwrap();
    let profile = Profile::new_google(
        "https://accounts.google.com",
        "auth-subject",
        "auth@example.com",
        "Auth User",
        None,
        None,
    );
    store.upsert_profile(&profile).unwrap();
    store
}

fn valid_google_key() -> String {
    format!("AIzaSy{}", "1".repeat(33))
}

fn add_profile(store: &ProfileStore, subject: &str) -> String {
    let profile = Profile::new_google(
        "https://accounts.google.com",
        subject,
        &format!("{subject}@example.com"),
        "Auth User",
        None,
        None,
    );
    let profile_id = profile.id.clone();
    store.upsert_profile(&profile).unwrap();
    profile_id
}

#[test]
fn round_trip_encrypted_api_key() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let profile_id = store.list_profiles().unwrap().remove(0).id;

    encrypt_and_save_api_key_with_vault(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &valid_google_key(),
        &vault,
    )
    .unwrap();

    let value = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &profile_id,
        &vault,
    )
    .unwrap()
    .unwrap();
    assert_eq!(value.api_key.expose(), valid_google_key());
}

#[test]
fn invalid_google_key_is_rejected() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let profile_id = store.list_profiles().unwrap().remove(0).id;

    let error = encrypt_and_save_api_key_with_vault(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        "not-a-valid-key",
        &vault,
    )
    .unwrap_err();

    assert!(error.to_string().starts_with("invalid-credential:"));
}

#[test]
fn saved_payload_is_strict_version_three_without_fingerprint() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let profile_id = store.list_profiles().unwrap().remove(0).id;
    let key = valid_google_key();

    encrypt_and_save_api_key_with_vault(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &key,
        &vault,
    )
    .unwrap();

    let payload_path = store.get_provider_key_path(&profile_id, "google-ai-studio");
    let first_json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&payload_path).unwrap()).unwrap();
    let first = &first_json["profiles"][&profile_id]["google-ai-studio"];
    let first_ciphertext = first["ciphertext"].as_str().unwrap().to_owned();

    assert_eq!(first_json["schema"].as_u64(), Some(3));
    assert_eq!(first["cipher"].as_str(), Some("aes-256-gcm"));
    assert_eq!(first["kdf"].as_str(), Some("hkdf-sha256"));
    assert!(first.get("key-fingerprint").is_none());
    assert!(first.get("tag").is_none());

    encrypt_and_save_api_key_with_vault(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &key,
        &vault,
    )
    .unwrap();
    let second_json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(payload_path).unwrap()).unwrap();
    assert_ne!(
        second_json["profiles"][&profile_id]["google-ai-studio"]["ciphertext"].as_str(),
        Some(first_ciphertext.as_str())
    );
}

#[test]
fn credential_identity_is_deterministic_across_profiles() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let second_profile_id = add_profile(&store, "other-auth-subject");
    let first_profile_id = store
        .list_profiles()
        .unwrap()
        .into_iter()
        .find(|profile| profile.id != second_profile_id)
        .unwrap()
        .id;
    let key = valid_google_key();

    for profile_id in [&first_profile_id, &second_profile_id] {
        encrypt_and_save_api_key_with_vault(
            &store,
            profile_id,
            ApiKeyProvider::GoogleAiStudio,
            &key,
            &vault,
        )
        .unwrap();
    }

    let first = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &first_profile_id,
        &vault,
    )
    .unwrap()
    .unwrap();
    let second = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &second_profile_id,
        &vault,
    )
    .unwrap()
    .unwrap();
    assert!(first.runtime_digest.matches(&second.runtime_digest));
}

#[test]
fn different_keys_have_different_runtime_identities() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let first_profile_id = store.list_profiles().unwrap().remove(0).id;
    let second_profile_id = add_profile(&store, "second-subject");

    for (profile_id, key) in [
        (&first_profile_id, valid_google_key()),
        (&second_profile_id, format!("AIzaSy{}", "2".repeat(33))),
    ] {
        encrypt_and_save_api_key_with_vault(
            &store,
            profile_id,
            ApiKeyProvider::GoogleAiStudio,
            &key,
            &vault,
        )
        .unwrap();
    }
    let first = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &first_profile_id,
        &vault,
    )
    .unwrap()
    .unwrap();
    let second = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &second_profile_id,
        &vault,
    )
    .unwrap()
    .unwrap();
    assert!(!first.runtime_digest.matches(&second.runtime_digest));
}

#[test]
fn tampered_ciphertext_is_rejected() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let profile_id = store.list_profiles().unwrap().remove(0).id;

    encrypt_and_save_api_key_with_vault(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &valid_google_key(),
        &vault,
    )
    .unwrap();

    let path = store.get_provider_key_path(&profile_id, "google-ai-studio");
    let mut json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    let ciphertext = json["profiles"][&profile_id]["google-ai-studio"]["ciphertext"]
        .as_str()
        .unwrap()
        .to_owned();
    let replacement = if ciphertext.starts_with('A') {
        "B"
    } else {
        "A"
    };
    json["profiles"][&profile_id]["google-ai-studio"]["ciphertext"] =
        serde_json::Value::String(format!("{replacement}{}", &ciphertext[1..]));
    fs::write(&path, serde_json::to_vec_pretty(&json).unwrap()).unwrap();

    let error = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &profile_id,
        &vault,
    )
    .unwrap_err();
    assert!(error.to_string().starts_with("malformed-key-store:"));
}

#[test]
fn version_two_payload_is_rejected_without_fallback() {
    let store = temp_store();
    let vault = MemoryVault::default();
    let profile_id = store.list_profiles().unwrap().remove(0).id;
    let path = store.get_provider_key_path(&profile_id, "google-ai-studio");
    fs::write(
        &path,
        br#"{"profile":{"google ai studio":{"version":2,"ciphertext":"discarded"}}}"#,
    )
    .unwrap();

    let error = get_decrypted_api_key_with_vault(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &profile_id,
        &vault,
    )
    .unwrap_err();
    assert!(error.to_string().contains("malformed-key-store"));
}
