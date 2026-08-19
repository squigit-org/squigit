// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};

use chrono::{DateTime, Utc};
use fs2::FileExt;

use super::types::{
    canonical_google_issuer, EncryptedKeyRecord, KeyFile, LastLogin, Profile, ProfileAuth,
    ProfileIdentity, ProfileSnapshot, AUTH_MODE_GOOGLE_OIDC_PKCE, AUTH_SCHEMA_VERSION,
    GOOGLE_PROVIDER, KEY_FILE_SCHEMA_VERSION,
};
use crate::error::{Result, StorageError};

/// Active account state filename.
const AUTH_FILE: &str = "auth.json";

/// Consolidated profile metadata filename.
const PROFILES_FILE: &str = "profiles.json";

/// Consolidated encrypted API keys filename.
const KEYS_FILE: &str = "keys.json";
const KEYS_LOCK_FILE: &str = "keys.lock";

type ProfileMap = BTreeMap<String, Profile>;
static KEY_FILE_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

pub struct KeyStoreTransaction<'a> {
    store: &'a ProfileStore,
    _process_guard: MutexGuard<'static, ()>,
    lock_file: File,
}

impl KeyStoreTransaction<'_> {
    pub fn load(&self) -> Result<KeyFile> {
        self.store.load_key_file_unlocked()
    }

    pub fn save(&self, keys: &KeyFile) -> Result<()> {
        self.store.save_key_file_unlocked(keys)
    }
}

impl Drop for KeyStoreTransaction<'_> {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.lock_file);
    }
}

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
    /// Cross-process advisory lock for the encrypted API key store.
    pub(super) keys_lock_path: PathBuf,
}

impl ProfileStore {
    /// Create a new profile store.
    ///
    /// Uses the OS-appropriate config directory:
    /// - Linux: `~/.config/squigit/`
    /// - macOS: `~/Library/Application Support/squigit/`
    /// - Windows: `%APPDATA%/squigit/`
    pub fn new() -> Result<Self> {
        let base_dir = crate::paths::base_config_dir().ok_or(StorageError::NoConfigDir)?;

        Self::with_base_dir(base_dir)
    }

    /// Create a profile store using an explicit base directory.
    ///
    /// This is primarily intended for tests and future CLI integration.
    pub fn with_base_dir(base_dir: PathBuf) -> Result<Self> {
        let auth_path = base_dir.join(AUTH_FILE);
        let profiles_path = base_dir.join(PROFILES_FILE);
        let keys_path = base_dir.join(KEYS_FILE);
        let keys_lock_path = base_dir.join(KEYS_LOCK_FILE);

        fs::create_dir_all(&base_dir)?;
        Self::ensure_private_directory(&base_dir)?;

        Ok(Self {
            base_dir,
            auth_path,
            profiles_path,
            keys_path,
            keys_lock_path,
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

    /// Get the provider key storage location for diagnostics and harnesses.
    ///
    /// API key payload reads and writes should use the typed payload methods.
    pub fn get_provider_key_path(&self, _profile_id: &str, _provider: &str) -> PathBuf {
        self.keys_path.clone()
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
        Self::validate_auth(&auth)?;
        Ok(auth)
    }

    fn save_auth(&self, auth: &ProfileAuth) -> Result<()> {
        Self::validate_auth(auth)?;
        self.write_json_atomic(&self.auth_path, auth)
    }

    fn load_profiles(&self) -> Result<ProfileMap> {
        if !self.profiles_path.exists() {
            return Ok(ProfileMap::default());
        }

        let content = fs::read_to_string(&self.profiles_path)?;
        let profiles: ProfileMap = serde_json::from_str(&content)?;
        Self::validate_profiles(&profiles)?;
        Ok(profiles)
    }

    fn save_profiles(&self, profiles: &ProfileMap) -> Result<()> {
        Self::validate_profiles(profiles)?;
        self.write_json_atomic(&self.profiles_path, profiles)
    }

    fn load_key_file_unlocked(&self) -> Result<KeyFile> {
        if !self.keys_path.exists() {
            return Ok(KeyFile::default());
        }

        let content = fs::read_to_string(&self.keys_path)?;
        let keys: KeyFile = serde_json::from_str(&content)
            .map_err(|error| StorageError::KeyStore(format!("malformed-key-store: {error}")))?;
        if keys.schema != KEY_FILE_SCHEMA_VERSION {
            return Err(StorageError::KeyStore(format!(
                "malformed-key-store: expected keys.json schema {KEY_FILE_SCHEMA_VERSION}"
            )));
        }
        Self::validate_key_profiles(&keys)?;
        Ok(keys)
    }

    fn save_key_file_unlocked(&self, keys: &KeyFile) -> Result<()> {
        Self::validate_key_profiles(keys)?;
        self.write_json_atomic(&self.keys_path, keys)
    }

    pub fn with_key_store_transaction<T, E>(
        &self,
        operation: impl FnOnce(&KeyStoreTransaction<'_>) -> std::result::Result<T, E>,
    ) -> std::result::Result<T, E>
    where
        E: From<StorageError>,
    {
        let process_mutex = KEY_FILE_MUTEX.get_or_init(|| Mutex::new(()));
        let process_guard = process_mutex
            .lock()
            .map_err(|_| StorageError::KeyStore("keys.lock mutex was poisoned".to_string()))?;

        Self::reject_symlink(&self.keys_lock_path)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock_file = options
            .open(&self.keys_lock_path)
            .map_err(StorageError::Io)?;
        Self::set_private_file_permissions(&self.keys_lock_path)?;
        lock_file.lock_exclusive().map_err(StorageError::Io)?;
        let transaction = KeyStoreTransaction {
            store: self,
            _process_guard: process_guard,
            lock_file,
        };
        operation(&transaction)
    }

    fn with_key_file_lock<T>(&self, operation: impl FnOnce() -> Result<T>) -> Result<T> {
        self.with_key_store_transaction(|_| operation())
    }

    fn sorted_profiles(mut profiles: Vec<Profile>) -> Vec<Profile> {
        profiles.sort_by_key(|profile| std::cmp::Reverse(profile.last_used_at));
        profiles
    }

    fn newest_profile_id(profiles: &ProfileMap) -> Option<String> {
        profiles
            .values()
            .max_by(|a, b| a.last_used_at.cmp(&b.last_used_at))
            .map(|profile| profile.id.clone())
    }

    fn validate_auth(auth: &ProfileAuth) -> Result<()> {
        if auth.schema != AUTH_SCHEMA_VERSION || auth.auth_mode != AUTH_MODE_GOOGLE_OIDC_PKCE {
            return Err(StorageError::AuthState(format!(
                "Unsupported auth.json schema. Delete the Squigit config folder or reinstall to start fresh with schema {}.",
                AUTH_SCHEMA_VERSION
            )));
        }

        if let Some(profile_id) = auth.active_profile_id.as_deref() {
            Self::validate_profile_id(profile_id)?;
        }
        if let Some(last_login) = &auth.last_login {
            let identity = ProfileIdentity::google(&last_login.issuer, &last_login.subject);
            if last_login.provider != GOOGLE_PROVIDER
                || last_login.profile_id != Profile::id_from_identity(&identity)
            {
                return Err(StorageError::InvalidProfileId(
                    last_login.profile_id.clone(),
                ));
            }
        }

        Ok(())
    }

    fn validate_profile_id(profile_id: &str) -> Result<()> {
        if Profile::is_canonical_id(profile_id) {
            Ok(())
        } else {
            Err(StorageError::InvalidProfileId(profile_id.to_string()))
        }
    }

    fn validate_profiles(profiles: &ProfileMap) -> Result<()> {
        for (profile_id, profile) in profiles {
            if profile_id != &profile.id || !profile.has_canonical_id() {
                return Err(StorageError::InvalidProfileId(profile_id.clone()));
            }
        }
        Ok(())
    }

    fn validate_key_profiles(keys: &KeyFile) -> Result<()> {
        for profile_id in keys.profiles.keys() {
            Self::validate_profile_id(profile_id)?;
        }
        Ok(())
    }

    pub fn load_encrypted_key_record(
        &self,
        profile_id: &str,
        provider_key: &str,
    ) -> Result<Option<EncryptedKeyRecord>> {
        self.with_key_store_transaction(|transaction| {
            let keys = transaction.load()?;
            Ok(keys
                .profiles
                .get(profile_id)
                .and_then(|profile_keys| profile_keys.get(provider_key))
                .cloned())
        })
    }

    pub fn save_encrypted_key_record(
        &self,
        profile_id: &str,
        provider_key: &str,
        record: EncryptedKeyRecord,
    ) -> Result<()> {
        self.with_key_store_transaction(|transaction| {
            let mut keys = transaction.load()?;
            keys.profiles
                .entry(profile_id.to_string())
                .or_default()
                .insert(provider_key, record)
                .map_err(|message| StorageError::KeyStore(message.to_string()))?;
            transaction.save(&keys)
        })
    }

    pub fn update_last_trusted_reveal(&self) -> Result<()> {
        self.with_key_store_transaction(|transaction| {
            let mut keys = transaction.load()?;
            keys.last_trusted_reveal = Some(Utc::now());
            transaction.save(&keys)
        })
    }

    pub fn invalidate_last_trusted_reveal(&self) -> Result<()> {
        self.with_key_store_transaction(|transaction| {
            let mut keys = transaction.load()?;
            use chrono::TimeZone;
            keys.last_trusted_reveal = Some(Utc.with_ymd_and_hms(1990, 1, 1, 0, 0, 0).unwrap());
            transaction.save(&keys)
        })
    }

    pub fn get_last_trusted_reveal(&self) -> Result<Option<DateTime<Utc>>> {
        self.with_key_store_transaction(|transaction| {
            let keys = transaction.load()?;
            Ok(keys.last_trusted_reveal)
        })
    }

    pub fn get_key_width(&self, profile_id: &str, provider_key: &str) -> Result<Option<u32>> {
        self.with_key_store_transaction(|transaction| {
            let keys = transaction.load()?;
            Ok(keys
                .profiles
                .get(profile_id)
                .and_then(|profile_keys| profile_keys.get(provider_key))
                .map(|record| record.width))
        })
    }

    /// Delete a record. When it was the final record, `finalize_empty_store`
    /// runs after the empty file is durable. A finalizer failure restores the
    /// previous encrypted file before returning.
    pub fn delete_encrypted_key_record(
        &self,
        profile_id: &str,
        provider_key: &str,
        finalize_empty_store: impl FnOnce() -> Result<()>,
    ) -> Result<bool> {
        self.with_key_store_transaction(|transaction| {
            let previous = transaction.load()?;
            let mut keys = previous.clone();
            let mut changed = false;
            let mut remove_profile = false;

            if let Some(profile_keys) = keys.profiles.get_mut(profile_id) {
                changed = profile_keys.remove(provider_key).is_some();
                remove_profile = profile_keys.is_empty();
            }
            if remove_profile {
                keys.profiles.remove(profile_id);
            }
            if !changed {
                return Ok(false);
            }

            transaction.save(&keys)?;
            if keys.profiles.is_empty() {
                if let Err(error) = finalize_empty_store() {
                    transaction.save(&previous)?;
                    return Err(error);
                }
            }
            Ok(true)
        })
    }

    /// Delete all encrypted key records for a profile.
    pub fn delete_profile_key_records(&self, profile_id: &str) -> Result<bool> {
        self.with_key_store_transaction(|transaction| {
            let mut keys = transaction.load()?;
            if keys.profiles.remove(profile_id).is_none() {
                return Ok(keys.profiles.is_empty());
            }
            let is_empty = keys.profiles.is_empty();
            transaction.save(&keys)?;
            Ok(is_empty)
        })
    }

    pub fn key_file_is_empty(&self) -> Result<bool> {
        self.with_key_file_lock(|| Ok(self.load_key_file_unlocked()?.profiles.is_empty()))
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
            return Err(StorageError::ProfileNotFound(profile_id.to_string()));
        }

        let mut auth = self.load_auth()?;
        auth.active_profile_id = Some(profile_id.to_string());
        self.save_auth(&auth)?;
        self.touch_profile(profile_id)?;
        Ok(())
    }

    /// Record a successful provider login and activate the authenticated profile.
    pub fn record_last_login(&self, last_login: LastLogin) -> Result<()> {
        let profiles = self.load_profiles()?;

        if !profiles.contains_key(&last_login.profile_id) {
            return Err(StorageError::ProfileNotFound(last_login.profile_id.clone()));
        }

        self.save_auth(&ProfileAuth {
            schema: AUTH_SCHEMA_VERSION,
            auth_mode: AUTH_MODE_GOOGLE_OIDC_PKCE.to_string(),
            active_profile_id: Some(last_login.profile_id.clone()),
            last_login: Some(last_login.clone()),
        })?;
        self.touch_profile(&last_login.profile_id)?;
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
            let mut auth = self.load_auth()?;
            auth.active_profile_id = Some(stored_profile.id);
            self.save_auth(&auth)?;
        }

        Ok(())
    }

    /// Get a profile by ID.
    pub fn get_profile(&self, profile_id: &str) -> Result<Option<Profile>> {
        let profiles = self.load_profiles()?;
        Ok(profiles.get(profile_id).cloned())
    }

    /// Find a profile by provider issuer and subject.
    pub fn find_profile_by_identity(&self, issuer: &str, subject: &str) -> Result<Option<Profile>> {
        let issuer = canonical_google_issuer(issuer);
        let profiles = self.load_profiles()?;
        Ok(profiles.into_values().find(|profile| {
            profile.identity.issuer == issuer && profile.identity.subject == subject
        }))
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
            return Err(StorageError::CannotDeleteLastProfile);
        }

        if profiles.remove(profile_id).is_none() {
            return Err(StorageError::ProfileNotFound(profile_id.to_string()));
        }

        let profile_dir = self.get_profile_dir(profile_id);
        if profile_dir.exists() {
            fs::remove_dir_all(&profile_dir)?;
        }

        self.delete_profile_key_records(profile_id)?;
        self.save_profiles(&profiles)?;

        let mut auth = self.load_auth()?;
        let active_is_missing = match auth.active_profile_id.as_deref() {
            Some(active_id) => !profiles.contains_key(active_id),
            None => true,
        };

        if active_is_missing {
            auth.active_profile_id = Self::newest_profile_id(&profiles);
        }

        if auth
            .last_login
            .as_ref()
            .is_some_and(|last_login| last_login.profile_id == profile_id)
        {
            auth.last_login = None;
        }

        self.save_auth(&auth)?;

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
