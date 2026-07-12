// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use crate::error::{ProfileError, Result};
use crate::types::{Profile, ProfileAuth, ProfileSnapshot};

/// Active account state filename.
const AUTH_FILE: &str = "auth.json";

/// Consolidated profile metadata filename.
const PROFILES_FILE: &str = "profiles.json";

/// Consolidated encrypted API keys filename.
const KEYS_FILE: &str = "keys.json";

type ProfileMap = BTreeMap<String, Profile>;

/// Manager for profile storage operations.
///
/// Root storage shape:
/// - `{base_dir}/auth.json`
/// - `{base_dir}/profiles.json`
/// - `{base_dir}/keys.json`
/// - `{base_dir}/threads/`
pub struct ProfileStore {
    /// Base directory: `{config_dir}/squigit/`
    pub(super) base_dir: PathBuf,
    /// Path to the active account state file.
    pub(super) auth_path: PathBuf,
    /// Path to the consolidated profile metadata file.
    pub(super) profiles_path: PathBuf,
    /// Path to the consolidated encrypted API keys file.
    pub(super) keys_path: PathBuf,
}

impl ProfileStore {
    /// Create a new profile store.
    ///
    /// Uses the OS-appropriate config directory:
    /// - Linux: `~/.config/squigit/`
    /// - macOS: `~/Library/Application Support/squigit/`
    /// - Windows: `%APPDATA%/squigit/`
    pub fn new() -> Result<Self> {
        let base_dir = squigit_memory::paths::base_config_dir().ok_or(ProfileError::NoConfigDir)?;

        Self::with_base_dir(base_dir)
    }

    /// Create a profile store using an explicit base directory.
    ///
    /// This is primarily intended for tests and future CLI integration.
    pub fn with_base_dir(base_dir: PathBuf) -> Result<Self> {
        let auth_path = base_dir.join(AUTH_FILE);
        let profiles_path = base_dir.join(PROFILES_FILE);
        let keys_path = base_dir.join(KEYS_FILE);

        fs::create_dir_all(&base_dir)?;

        Ok(Self {
            base_dir,
            auth_path,
            profiles_path,
            keys_path,
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

    /// Get the global threads directory.
    ///
    /// Returns `{base_dir}/threads/`
    pub fn get_threads_dir(&self) -> PathBuf {
        self.base_dir.join("threads")
    }

    /// Get the consolidated key file path.
    pub fn get_keys_path(&self) -> PathBuf {
        self.keys_path.clone()
    }

    /// Get the provider key file path.
    ///
    /// API keys are stored together in `{base_dir}/keys.json`, nested by profile ID
    /// and provider name.
    pub fn get_provider_key_path(&self, _profile_id: &str, _provider: &str) -> PathBuf {
        self.get_keys_path()
    }

    // =========================================================================
    // Root File Operations
    // =========================================================================

    fn load_auth(&self) -> Result<ProfileAuth> {
        if !self.auth_path.exists() {
            return Ok(ProfileAuth::default());
        }

        let content = fs::read_to_string(&self.auth_path)?;
        let auth: ProfileAuth = serde_json::from_str(&content)?;
        Ok(auth)
    }

    fn save_auth(&self, auth: &ProfileAuth) -> Result<()> {
        self.write_json_atomic(&self.auth_path, auth)
    }

    fn load_profiles(&self) -> Result<ProfileMap> {
        if !self.profiles_path.exists() {
            return Ok(ProfileMap::default());
        }

        let content = fs::read_to_string(&self.profiles_path)?;
        let profiles: ProfileMap = serde_json::from_str(&content)?;
        Ok(profiles)
    }

    fn save_profiles(&self, profiles: &ProfileMap) -> Result<()> {
        self.write_json_atomic(&self.profiles_path, profiles)
    }

    fn sorted_profiles(mut profiles: Vec<Profile>) -> Vec<Profile> {
        profiles.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
        profiles
    }

    fn newest_profile_id(profiles: &ProfileMap) -> Option<String> {
        profiles
            .values()
            .max_by(|a, b| a.last_used_at.cmp(&b.last_used_at))
            .map(|profile| profile.id.clone())
    }

    fn delete_profile_keys(&self, profile_id: &str) -> Result<()> {
        if !self.keys_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&self.keys_path)?;
        let mut keys: BTreeMap<String, serde_json::Value> = serde_json::from_str(&content)?;
        if keys.remove(profile_id).is_some() {
            self.write_json_atomic(&self.keys_path, &keys)?;
        }

        Ok(())
    }

    // =========================================================================
    // Auth Operations
    // =========================================================================

    /// Get the ID of the currently active profile.
    pub fn get_active_profile_id(&self) -> Result<Option<String>> {
        let auth = self.load_auth()?;
        let profiles = self.load_profiles()?;

        Ok(auth
            .active_profile_id
            .filter(|profile_id| profiles.contains_key(profile_id)))
    }

    /// Set the active profile by ID.
    ///
    /// Returns an error if the profile doesn't exist.
    pub fn set_active_profile_id(&self, profile_id: &str) -> Result<()> {
        let profiles = self.load_profiles()?;

        if !profiles.contains_key(profile_id) {
            return Err(ProfileError::ProfileNotFound(profile_id.to_string()));
        }

        self.save_auth(&ProfileAuth {
            active_profile_id: Some(profile_id.to_string()),
        })?;
        self.touch_profile(profile_id)?;
        Ok(())
    }

    /// Clear the active profile (for Guest mode logout).
    pub fn clear_active_profile_id(&self) -> Result<()> {
        self.save_auth(&ProfileAuth::default())
    }

    // =========================================================================
    // Profile CRUD
    // =========================================================================

    /// Create or update a profile.
    ///
    /// If the profile already exists, it will be updated with the new data.
    /// Profile metadata is stored in the root profiles.json file.
    pub fn upsert_profile(&self, profile: &Profile) -> Result<()> {
        let mut profiles = self.load_profiles()?;
        let mut stored_profile = profile.clone();

        if let Some(existing_profile) = profiles.get(&profile.id) {
            stored_profile.created_at = existing_profile.created_at;
            if stored_profile.avatar_url.is_none() {
                stored_profile.avatar_url = existing_profile.avatar_url.clone();
            }
            if stored_profile.avatar_base64.is_none()
                && stored_profile.avatar_url == existing_profile.avatar_url
            {
                stored_profile.avatar_base64 = existing_profile.avatar_base64.clone();
            }
        }

        profiles.insert(stored_profile.id.clone(), stored_profile.clone());
        self.save_profiles(&profiles)?;

        let auth = self.load_auth()?;
        let needs_active_profile = match auth.active_profile_id.as_deref() {
            Some(active_id) => !profiles.contains_key(active_id),
            None => true,
        };

        if needs_active_profile {
            self.save_auth(&ProfileAuth {
                active_profile_id: Some(stored_profile.id),
            })?;
        }

        Ok(())
    }

    /// Get a profile by ID.
    pub fn get_profile(&self, profile_id: &str) -> Result<Option<Profile>> {
        let profiles = self.load_profiles()?;
        Ok(profiles.get(profile_id).cloned())
    }

    /// Find a profile by email address.
    ///
    /// Profile IDs are derived from normalized email addresses, so this
    /// performs a deterministic lookup and verifies the profile exists.
    pub fn find_profile_by_email(&self, email: &str) -> Result<Option<Profile>> {
        let normalized = email.trim();
        if normalized.is_empty() {
            return Ok(None);
        }

        let profile_id = Profile::id_from_email(normalized);
        self.get_profile(&profile_id)
    }

    /// Get the currently active profile.
    pub fn get_active_profile(&self) -> Result<Option<Profile>> {
        let auth = self.load_auth()?;
        let profiles = self.load_profiles()?;

        Ok(auth
            .active_profile_id
            .and_then(|profile_id| profiles.get(&profile_id).cloned()))
    }

    /// List all profiles.
    pub fn list_profiles(&self) -> Result<Vec<Profile>> {
        let profiles = self.load_profiles()?;
        Ok(Self::sorted_profiles(profiles.into_values().collect()))
    }

    /// Load active account state and all profiles from root files.
    pub fn profile_snapshot(&self) -> Result<ProfileSnapshot> {
        let auth = self.load_auth()?;
        let profiles = self.load_profiles()?;
        let active_profile_id = auth
            .active_profile_id
            .filter(|profile_id| profiles.contains_key(profile_id));
        let active_profile = active_profile_id
            .as_deref()
            .and_then(|profile_id| profiles.get(profile_id).cloned());

        Ok(ProfileSnapshot {
            active_profile_id,
            active_profile,
            profiles: Self::sorted_profiles(profiles.into_values().collect()),
        })
    }

    /// Delete a profile and all its data.
    ///
    /// Returns an error if trying to delete the last profile.
    pub fn delete_profile(&self, profile_id: &str) -> Result<()> {
        let mut profiles = self.load_profiles()?;

        if profiles.len() <= 1 && profiles.contains_key(profile_id) {
            return Err(ProfileError::CannotDeleteLastProfile);
        }

        if profiles.remove(profile_id).is_none() {
            return Err(ProfileError::ProfileNotFound(profile_id.to_string()));
        }

        let profile_dir = self.get_profile_dir(profile_id);
        if profile_dir.exists() {
            fs::remove_dir_all(&profile_dir)?;
        }

        self.delete_profile_keys(profile_id)?;
        self.save_profiles(&profiles)?;

        let mut auth = self.load_auth()?;
        let active_is_missing = match auth.active_profile_id.as_deref() {
            Some(active_id) => !profiles.contains_key(active_id),
            None => true,
        };

        if active_is_missing {
            auth.active_profile_id = Self::newest_profile_id(&profiles);
            self.save_auth(&auth)?;
        }

        Ok(())
    }

    /// Check if any profiles exist.
    pub fn has_profiles(&self) -> Result<bool> {
        let profiles = self.load_profiles()?;
        Ok(!profiles.is_empty())
    }

    /// Get the count of profiles.
    pub fn profile_count(&self) -> Result<usize> {
        let profiles = self.load_profiles()?;
        Ok(profiles.len())
    }

    fn touch_profile(&self, profile_id: &str) -> Result<()> {
        let mut profiles = self.load_profiles()?;
        let Some(profile) = profiles.get_mut(profile_id) else {
            return Ok(());
        };

        profile.touch();
        self.save_profiles(&profiles)
    }
}
