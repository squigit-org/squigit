// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;

use sha2::{Digest, Sha256};
use squigit_auth::security::{encrypt_and_save_api_key, get_decrypted_key, ApiKeyProvider};
use squigit_storage::{Profile, ProfileStore};
use tempfile::tempdir;

fn temp_store() -> ProfileStore {
    let temp_dir = tempdir().unwrap();
    let root = temp_dir.path().to_path_buf();
    std::mem::forget(temp_dir);
    let store = ProfileStore::with_base_dir(root.to_path_buf()).unwrap();
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

fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

#[test]
fn round_trip_encrypted_api_key() {
    let store = temp_store();
    let profile_id = store
        .list_profiles()
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
        .id;

    encrypt_and_save_api_key(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &valid_google_key(),
    )
    .unwrap();

    let value = get_decrypted_key(&store, ApiKeyProvider::GoogleAiStudio, &profile_id)
        .unwrap()
        .unwrap();
    assert_eq!(value, valid_google_key());
}

#[test]
fn invalid_google_key_is_rejected() {
    let store = temp_store();
    let profile_id = store
        .list_profiles()
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
        .id;

    let err = encrypt_and_save_api_key(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        "not-a-valid-key",
    )
    .unwrap_err();

    assert_eq!(
        err.to_string(),
        "Invalid Google AI Studio API key format. Expected a key that starts with 'AIzaSy' (39 chars) or 'AQ.' (50-60 chars)."
    );
}

#[test]
fn saved_payload_includes_plaintext_hash() {
    let store = temp_store();
    let profile_id = store
        .list_profiles()
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
        .id;
    let key = valid_google_key();

    encrypt_and_save_api_key(&store, &profile_id, ApiKeyProvider::GoogleAiStudio, &key).unwrap();

    let payload_path = store.get_provider_key_path(&profile_id, "google ai studio");
    let payload = fs::read_to_string(payload_path).unwrap();
    let json: serde_json::Value = serde_json::from_str(&payload).unwrap();
    let expected_hash = sha256_hex(&key);
    assert_eq!(
        json[&profile_id]["google ai studio"]["sha256"].as_str(),
        Some(expected_hash.as_str())
    );
}

#[test]
fn tampered_hash_is_rejected() {
    let store = temp_store();
    let profile_id = store
        .list_profiles()
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
        .id;

    encrypt_and_save_api_key(
        &store,
        &profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &valid_google_key(),
    )
    .unwrap();

    let payload_path = store.get_provider_key_path(&profile_id, "google ai studio");
    let payload = fs::read_to_string(&payload_path).unwrap();
    let mut json: serde_json::Value = serde_json::from_str(&payload).unwrap();
    json[&profile_id]["google ai studio"]["sha256"] =
        serde_json::Value::String("deadbeef".to_string());
    fs::write(&payload_path, serde_json::to_vec_pretty(&json).unwrap()).unwrap();

    let err = get_decrypted_key(&store, ApiKeyProvider::GoogleAiStudio, &profile_id).unwrap_err();
    assert_eq!(err.to_string(), "Stored API key hash mismatch");
}
