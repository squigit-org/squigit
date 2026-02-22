// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Profile storage manager.

use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;

use crate::error::{ProfileError, Result};
use crate::types::{Profile, ProfileIndex};

/// Storage directory name under the app config.
const STORAGE_DIR: &str = "Local Storage";

/// Profile index filename.
const INDEX_FILE: &str = "index.json";

/// Individual profile metadata filename.
const PROFILE_FILE: &str = "profile.json";

/// Manager for profile storage operations.
///
/// Handles CRUD operations for profiles, maintaining an index
/// of all profiles and tracking the active profile.
pub struct ProfileStore {
    /// Base directory: `{config_dir}/snapllm/Local Storage/`
    base_dir: PathBuf,
    /// Path to the index file.
    index_path: PathBuf,
}

impl ProfileStore {
    /// Create a new profile store.
    ///
    /// Uses the OS-appropriate config directory:
    /// - Linux: `~/.config/snapllm/Local Storage/`
    /// - macOS: `~/Library/Application Support/snapllm/Local Storage/`
    /// - Windows: `%APPDATA%/snapllm/Local Storage/`
    pub fn new() -> Result<Self> {
        let base_dir = dirs::config_dir()
            .ok_or(ProfileError::NoConfigDir)?
            .join("SnapLLM".to_lowercase())
            .join(STORAGE_DIR);

        let index_path = base_dir.join(INDEX_FILE);

        // Ensure base directory exists
        fs::create_dir_all(&base_dir)?;

        Ok(Self {
            base_dir,
            index_path,
        })
    }

    /// Get the base storage directory path.
    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    /// Get the directory path for a specific profile.
    ///
    /// Returns `{base_dir}/{profile_id}/`
    pub fn get_profile_dir(&self, profile_id: &str) -> PathBuf {
        self.base_dir.join(profile_id)
    }

    /// Get the chats directory for a specific profile.
    ///
    /// Returns `{base_dir}/{profile_id}/chats/`
    pub fn get_chats_dir(&self, profile_id: &str) -> PathBuf {
        self.get_profile_dir(profile_id).join("chats")
    }

    // =========================================================================
    // Index Operations
    // =========================================================================

    /// Load the profile index from disk.
    fn load_index(&self) -> Result<ProfileIndex> {
        if !self.index_path.exists() {
            return Ok(ProfileIndex::default());
        }

        let content = fs::read_to_string(&self.index_path)?;
        let index: ProfileIndex = serde_json::from_str(&content)?;
        Ok(index)
    }

    /// Save the profile index to disk.
    fn save_index(&self, index: &ProfileIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)?;
        let mut file = File::create(&self.index_path)?;
        file.write_all(json.as_bytes())?;
        Ok(())
    }

    /// Get the ID of the currently active profile.
    pub fn get_active_profile_id(&self) -> Result<Option<String>> {
        let index = self.load_index()?;
        Ok(index.active_profile_id)
    }

    /// Set the active profile by ID.
    ///
    /// Returns an error if the profile doesn't exist.
    pub fn set_active_profile_id(&self, profile_id: &str) -> Result<()> {
        let mut index = self.load_index()?;

        if !index.contains(profile_id) {
            return Err(ProfileError::ProfileNotFound(profile_id.to_string()));
        }

        index.active_profile_id = Some(profile_id.to_string());
        self.save_index(&index)?;
        Ok(())
    }

    /// Clear the active profile (for Guest mode logout).
    pub fn clear_active_profile_id(&self) -> Result<()> {
        let mut index = self.load_index()?;
        index.active_profile_id = None;
        self.save_index(&index)?;
        Ok(())
    }

    // =========================================================================
    // Profile CRUD
    // =========================================================================

    /// Create or update a profile.
    ///
    /// If the profile already exists, it will be updated with the new data.
    /// The profile is automatically added to the index.
    pub fn upsert_profile(&self, profile: &Profile) -> Result<()> {
        let profile_dir = self.get_profile_dir(&profile.id);
        fs::create_dir_all(&profile_dir)?;

        // Save profile data
        let profile_path = profile_dir.join(PROFILE_FILE);
        let json = serde_json::to_string_pretty(profile)?;
        let mut file = File::create(&profile_path)?;
        file.write_all(json.as_bytes())?;

        // Update index
        let mut index = self.load_index()?;
        index.add(profile.id.clone());

        // Set as active if this is the first profile
        if index.active_profile_id.is_none() {
            index.active_profile_id = Some(profile.id.clone());
        }

        self.save_index(&index)?;
        Ok(())
    }

    /// Get a profile by ID.
    pub fn get_profile(&self, profile_id: &str) -> Result<Option<Profile>> {
        let profile_path = self.get_profile_dir(profile_id).join(PROFILE_FILE);

        if !profile_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&profile_path)?;
        let profile: Profile = serde_json::from_str(&content)?;
        Ok(Some(profile))
    }

    /// Get the currently active profile.
    pub fn get_active_profile(&self) -> Result<Option<Profile>> {
        match self.get_active_profile_id()? {
            Some(id) => self.get_profile(&id),
            None => Ok(None),
        }
    }

    /// List all profiles.
    pub fn list_profiles(&self) -> Result<Vec<Profile>> {
        let index = self.load_index()?;
        let mut profiles = Vec::new();

        for id in &index.profile_ids {
            if let Some(profile) = self.get_profile(id)? {
                profiles.push(profile);
            }
        }

        // Sort by last used (most recent first)
        profiles.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));

        Ok(profiles)
    }

    /// Delete a profile and all its data.
    ///
    /// Returns an error if trying to delete the last profile.
    pub fn delete_profile(&self, profile_id: &str) -> Result<()> {
        let mut index = self.load_index()?;

        if index.profile_ids.len() <= 1 && index.contains(profile_id) {
            return Err(ProfileError::CannotDeleteLastProfile);
        }

        if !index.contains(profile_id) {
            return Err(ProfileError::ProfileNotFound(profile_id.to_string()));
        }

        // Remove profile directory
        let profile_dir = self.get_profile_dir(profile_id);
        if profile_dir.exists() {
            fs::remove_dir_all(&profile_dir)?;
        }

        // Update index
        index.remove(profile_id);
        self.save_index(&index)?;

        Ok(())
    }

    /// Check if any profiles exist.
    pub fn has_profiles(&self) -> Result<bool> {
        let index = self.load_index()?;
        Ok(!index.profile_ids.is_empty())
    }

    /// Get the count of profiles.
    pub fn profile_count(&self) -> Result<usize> {
        let index = self.load_index()?;
        Ok(index.profile_ids.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_store() -> ProfileStore {
        let temp_dir = env::temp_dir().join(format!("test_{}", std::process::id()));
        let base_dir = temp_dir.join(STORAGE_DIR);
        fs::create_dir_all(&base_dir).unwrap();

        ProfileStore {
            base_dir: base_dir.clone(),
            index_path: base_dir.join(INDEX_FILE),
        }
    }

    #[test]
    fn test_profile_crud() {
        let store = temp_store();

        // Create profile
        let profile = Profile::new("test@gmail.com", "Test User", None, None);
        store.upsert_profile(&profile).unwrap();

        // Verify it exists
        let loaded = store.get_profile(&profile.id).unwrap().unwrap();
        assert_eq!(loaded.email, "test@gmail.com");
        assert_eq!(loaded.name, "Test User");

        // Should be active (first profile)
        assert_eq!(store.get_active_profile_id().unwrap(), Some(profile.id.clone()));

        // Cleanup
        fs::remove_dir_all(store.base_dir.parent().unwrap()).ok();
    }
}
