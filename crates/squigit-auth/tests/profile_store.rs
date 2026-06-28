// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_auth::{Profile, ProfileIndex, ProfileStore};
use tempfile::tempdir;

fn temp_store() -> ProfileStore {
    let temp_dir = tempdir().unwrap();
    let root = temp_dir.path().to_path_buf();
    std::mem::forget(temp_dir);
    ProfileStore::with_base_dir(root.join("Local Storage")).unwrap()
}

#[test]
fn profile_crud() {
    let store = temp_store();

    let profile = Profile::new("test@gmail.com", "Test User", None, None);
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
    assert!(path.ends_with("profile1/imgbb_key.json"));
}

#[test]
fn profile_id_from_email() {
    let id1 = Profile::id_from_email("user@gmail.com");
    let id2 = Profile::id_from_email("USER@gmail.com");
    let id3 = Profile::id_from_email("  user@gmail.com  ");

    assert_eq!(id1, id2);
    assert_eq!(id1, id3);
    assert_eq!(id1.len(), 16);

    let id4 = Profile::id_from_email("other@gmail.com");
    assert_ne!(id1, id4);
}

#[test]
fn profile_index_operations() {
    let mut index = ProfileIndex::default();

    index.add("profile1".to_string());
    assert!(index.contains("profile1"));
    assert!(!index.contains("profile2"));

    index.add("profile2".to_string());
    index.active_profile_id = Some("profile1".to_string());

    index.remove("profile1");
    assert!(!index.contains("profile1"));
    assert_eq!(index.active_profile_id, Some("profile2".to_string()));
}
