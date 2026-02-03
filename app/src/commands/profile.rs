// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Profile management Tauri commands.

use ops_profile_store::{Profile, ProfileStore};
use serde::Serialize;

/// Profile data returned to frontend.
#[derive(Debug, Clone, Serialize)]
pub struct ProfileInfo {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar: Option<String>,
}

impl From<Profile> for ProfileInfo {
    fn from(p: Profile) -> Self {
        Self {
            id: p.id,
            name: p.name,
            email: p.email,
            avatar: p.avatar,
        }
    }
}

/// Get the currently active profile.
#[tauri::command]
pub fn get_active_profile() -> Result<Option<ProfileInfo>, String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    let profile = store.get_active_profile().map_err(|e| e.to_string())?;
    Ok(profile.map(ProfileInfo::from))
}

/// Get the active profile ID.
#[tauri::command]
pub fn get_active_profile_id() -> Result<Option<String>, String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    store.get_active_profile_id().map_err(|e| e.to_string())
}

/// Set the active profile by ID.
#[tauri::command]
pub fn set_active_profile(profile_id: String) -> Result<(), String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    
    // Update last_used_at timestamp
    if let Some(mut profile) = store.get_profile(&profile_id).map_err(|e| e.to_string())? {
        profile.touch();
        store.upsert_profile(&profile).map_err(|e| e.to_string())?;
    }
    
    store.set_active_profile_id(&profile_id).map_err(|e| e.to_string())
}

/// List all profiles.
#[tauri::command]
pub fn list_profiles() -> Result<Vec<ProfileInfo>, String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    let profiles = store.list_profiles().map_err(|e| e.to_string())?;
    Ok(profiles.into_iter().map(ProfileInfo::from).collect())
}

/// Delete a profile by ID.
#[tauri::command]
pub fn delete_profile(profile_id: String) -> Result<(), String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    store.delete_profile(&profile_id).map_err(|e| e.to_string())
}

/// Check if any profiles exist.
#[tauri::command]
pub fn has_profiles() -> Result<bool, String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    store.has_profiles().map_err(|e| e.to_string())
}

/// Get profile count.
#[tauri::command]
pub fn get_profile_count() -> Result<usize, String> {
    let store = ProfileStore::new().map_err(|e| e.to_string())?;
    store.profile_count().map_err(|e| e.to_string())
}
