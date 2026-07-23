// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;

use squigit_auth::security::{
    encrypt_and_save_api_key, get_decrypted_api_key, get_decrypted_key, google_api_key_fingerprint,
    verify_google_api_key_fingerprint, ApiKeyProvider,
};
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
fn saved_payload_is_version_two_with_stable_fingerprint() {
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
    let first_payload = fs::read_to_string(&payload_path).unwrap();
    let first_json: serde_json::Value = serde_json::from_str(&first_payload).unwrap();
    let first = &first_json[&profile_id]["google ai studio"];
    let first_ciphertext = first["ciphertext"].as_str().unwrap().to_string();
    let expected_fingerprint = google_api_key_fingerprint(&key);

    assert_eq!(first["version"].as_u64(), Some(2));
    assert!(first.get("sha256").is_none());
    assert_eq!(
        first["key_fingerprint"].as_str(),
        Some(expected_fingerprint.as_str())
    );

    encrypt_and_save_api_key(&store, &profile_id, ApiKeyProvider::GoogleAiStudio, &key).unwrap();
    let second_payload = fs::read_to_string(payload_path).unwrap();
    let second_json: serde_json::Value = serde_json::from_str(&second_payload).unwrap();
    let second = &second_json[&profile_id]["google ai studio"];
    assert_eq!(
        second["key_fingerprint"].as_str(),
        Some(expected_fingerprint.as_str())
    );
    assert_ne!(
        second["ciphertext"].as_str(),
        Some(first_ciphertext.as_str())
    );
}

#[test]
fn fingerprint_is_deterministic_across_profiles_and_has_known_value() {
    let store = temp_store();
    let second_profile_id = add_profile(&store, "other-auth-subject");
    let first_profile_id = store
        .list_profiles()
        .unwrap()
        .into_iter()
        .find(|profile| profile.id != second_profile_id)
        .unwrap()
        .id;
    let key = valid_google_key();
    let expected = "gai_v1_HwPdxCtaOOKBw2KqFMbhrwZKXgdc4l8uCcnG5JwjyeY";

    assert_eq!(google_api_key_fingerprint(&format!("  {key}\n")), expected);
    assert!(verify_google_api_key_fingerprint(&key, expected));

    encrypt_and_save_api_key(
        &store,
        &first_profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &key,
    )
    .unwrap();
    encrypt_and_save_api_key(
        &store,
        &second_profile_id,
        ApiKeyProvider::GoogleAiStudio,
        &key,
    )
    .unwrap();

    let first = get_decrypted_api_key(&store, ApiKeyProvider::GoogleAiStudio, &first_profile_id)
        .unwrap()
        .unwrap();
    let second = get_decrypted_api_key(&store, ApiKeyProvider::GoogleAiStudio, &second_profile_id)
        .unwrap()
        .unwrap();
    assert_eq!(first.key_fingerprint, expected);
    assert_eq!(second.key_fingerprint, expected);
    assert_ne!(first.encrypted_key_ref, second.encrypted_key_ref);
}

#[test]
fn different_keys_have_different_fingerprints() {
    let first = valid_google_key();
    let second = format!("AIzaSy{}", "2".repeat(33));

    assert_ne!(
        google_api_key_fingerprint(&first),
        google_api_key_fingerprint(&second)
    );
    assert!(!verify_google_api_key_fingerprint(
        &second,
        &google_api_key_fingerprint(&first)
    ));
}

#[test]
fn tampered_fingerprint_is_rejected() {
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
    json[&profile_id]["google ai studio"]["key_fingerprint"] =
        serde_json::Value::String(format!("gai_v1_{}", "A".repeat(43)));
    fs::write(&payload_path, serde_json::to_vec_pretty(&json).unwrap()).unwrap();

    let err = get_decrypted_key(&store, ApiKeyProvider::GoogleAiStudio, &profile_id).unwrap_err();
    assert_eq!(err.to_string(), "Stored API key fingerprint mismatch");
}

#[test]
fn version_one_payload_is_rejected_without_fallback() {
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
    json[&profile_id]["google ai studio"]["version"] = serde_json::Value::from(1);
    fs::write(&payload_path, serde_json::to_vec_pretty(&json).unwrap()).unwrap();

    let err = get_decrypted_key(&store, ApiKeyProvider::GoogleAiStudio, &profile_id).unwrap_err();
    assert_eq!(
        err.to_string(),
        "Unsupported encrypted API key payload version"
    );
}
