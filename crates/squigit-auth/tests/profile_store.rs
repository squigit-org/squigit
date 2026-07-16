// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_storage::{LastLogin, Profile, ProfileAuth, ProfileIdentity, ProfileStore};
use tempfile::tempdir;

fn temp_store() -> ProfileStore {
    let temp_dir = tempdir().unwrap();
    let root = temp_dir.path().to_path_buf();
    std::mem::forget(temp_dir);
    ProfileStore::with_base_dir(root.to_path_buf()).unwrap()
}

#[test]
fn profile_crud() {
    let store = temp_store();

    let profile = Profile::new_google(
        "https://accounts.google.com",
        "test-subject",
        "test@gmail.com",
        "Test User",
        None,
        None,
    );
    store.upsert_profile(&profile).unwrap();

    let loaded = store.get_profile(&profile.id).unwrap().unwrap();
    assert_eq!(loaded.email, "test@gmail.com");
    assert_eq!(loaded.name, "Test User");

    assert_eq!(
        store.get_active_profile_id().unwrap(),
        Some(profile.id.clone())
    );
}

#[test]
fn provider_key_path() {
    let store = temp_store();
    let path = store.get_provider_key_path("profile1", "imgbb");
    assert!(path.ends_with("keys.json"));
}

#[test]
fn profile_id_from_identity() {
    let id1 = Profile::id_from_identity(&ProfileIdentity::google(
        "https://accounts.google.com",
        "subject-1",
    ));
    let id2 =
        Profile::id_from_identity(&ProfileIdentity::google("accounts.google.com", "subject-1"));

    assert_eq!(id1, id2);
    assert_eq!(id1.len(), "google_".len() + 32);

    let id4 = Profile::id_from_identity(&ProfileIdentity::google(
        "https://accounts.google.com",
        "subject-2",
    ));
    assert_ne!(id1, id4);
}

#[test]
fn profile_auth_tracks_active_profile() {
    let auth = ProfileAuth {
        schema: 2,
        auth_mode: "google_oidc_pkce".to_string(),
        active_profile_id: Some("profile1".to_string()),
        last_login: None::<LastLogin>,
    };

    assert_eq!(auth.active_profile_id.as_deref(), Some("profile1"));
}
