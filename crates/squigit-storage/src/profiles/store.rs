// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};

use super::auth::{AuthState, AuthStore};
use super::types::{
    EncryptedKeyRecord, LastLogin, Profile, ProfileIdentity, ProfileSnapshot, GOOGLE_PROVIDER,
};
use crate::database::Database;
use crate::{Result, StorageError};

const PROFILE_COLUMNS: &str = "id, provider, issuer, subject, name, email, avatar_base64, avatar_url, created_at, last_used_at";

pub struct KeyStoreTransaction<'a> {
    connection: &'a Connection,
}

impl KeyStoreTransaction<'_> {
    pub fn is_empty(&self) -> Result<bool> {
        Ok(!self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM encrypted_keys)",
            [],
            |row| row.get::<_, bool>(0),
        )?)
    }

    pub fn get(&self, profile_id: &str, provider: &str) -> Result<Option<EncryptedKeyRecord>> {
        Ok(self.connection.query_row(
            "SELECT cipher, width, kdf, salt, nonce, ciphertext FROM encrypted_keys WHERE profile_id = ?1 AND provider = ?2",
            params![profile_id, provider],
            |row| {
                let value = serde_json::json!({
                    "cipher": row.get::<_, String>(0)?,
                    "width": row.get::<_, u32>(1)?,
                    "kdf": row.get::<_, String>(2)?,
                    "salt": row.get::<_, String>(3)?,
                    "nonce": row.get::<_, String>(4)?,
                    "ciphertext": row.get::<_, String>(5)?,
                });
                serde_json::from_value(value).map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error)))
            },
        ).optional()?)
    }

    pub fn set(&self, profile_id: &str, provider: &str, record: &EncryptedKeyRecord) -> Result<()> {
        if !matches!(provider, "openrouter" | "imgbb") {
            return Err(StorageError::KeyStore(
                "unsupported API-key provider".into(),
            ));
        }
        self.connection.execute(
            "INSERT INTO encrypted_keys (profile_id, provider, cipher, width, kdf, salt, nonce, ciphertext)
             VALUES (?1, ?2, 'aes-256-gcm', ?3, 'hkdf-sha256', ?4, ?5, ?6)
             ON CONFLICT (profile_id, provider) DO UPDATE SET cipher = excluded.cipher, width = excluded.width,
             kdf = excluded.kdf, salt = excluded.salt, nonce = excluded.nonce, ciphertext = excluded.ciphertext",
            params![profile_id, provider, record.width, record.salt, record.nonce, record.ciphertext],
        )?;
        Ok(())
    }

    pub fn delete(&self, profile_id: &str, provider: &str) -> Result<bool> {
        Ok(self.connection.execute(
            "DELETE FROM encrypted_keys WHERE profile_id = ?1 AND provider = ?2",
            params![profile_id, provider],
        )? > 0)
    }
}

pub struct ProfileStore {
    base_dir: PathBuf,
    database: Database,
    auth: AuthStore,
}

fn profile_from_row(row: &Row<'_>) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get(0)?,
        identity: ProfileIdentity {
            provider: row.get(1)?,
            issuer: row.get(2)?,
            subject: row.get(3)?,
        },
        name: row.get(4)?,
        email: row.get(5)?,
        avatar_base64: row.get(6)?,
        avatar_url: row.get(7)?,
        created_at: row.get(8)?,
        last_used_at: row.get(9)?,
    })
}

fn get_profile(connection: &Connection, profile_id: &str) -> Result<Option<Profile>> {
    let profile = connection
        .query_row(
            &format!("SELECT {PROFILE_COLUMNS} FROM profiles WHERE id = ?1"),
            [profile_id],
            profile_from_row,
        )
        .optional()?;
    if let Some(profile) = &profile {
        validate_profile(profile)?;
    }
    Ok(profile)
}

fn validate_profile(profile: &Profile) -> Result<()> {
    if !profile.has_canonical_id() {
        return Err(StorageError::InvalidProfileId(profile.id.clone()));
    }
    Ok(())
}

fn profile_snapshot(
    connection: &Connection,
    active_profile_id: Option<String>,
) -> Result<ProfileSnapshot> {
    let mut statement = connection.prepare(&format!(
        "SELECT {PROFILE_COLUMNS} FROM profiles ORDER BY id"
    ))?;
    let mut profiles = statement
        .query_map([], profile_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for profile in &profiles {
        validate_profile(profile)?;
    }
    profiles.sort_by_key(|profile| std::cmp::Reverse(profile.last_used_at));
    let active_profile_id = active_profile_id.filter(|id| profiles.iter().any(|p| &p.id == id));
    let active_profile = profiles
        .iter()
        .find(|profile| Some(&profile.id) == active_profile_id.as_ref())
        .cloned();
    Ok(ProfileSnapshot {
        active_profile_id,
        active_profile,
        profiles,
    })
}

impl ProfileStore {
    pub fn new() -> Result<Self> {
        Self::with_base_dir(crate::paths::base_config_dir().ok_or(StorageError::NoConfigDir)?)
    }

    pub fn with_base_dir(base_dir: PathBuf) -> Result<Self> {
        let database = Database::new(&base_dir)?;
        let auth = AuthStore::new(&base_dir)?;
        Ok(Self {
            base_dir,
            database,
            auth,
        })
    }

    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    fn with_auth_update<T>(
        &self,
        operation: impl FnOnce(&mut AuthState) -> Result<T>,
    ) -> Result<T> {
        let guard = self.auth.lock()?;
        let mut state = guard.load()?;
        let result = operation(&mut state)?;
        guard.save(&state)?;
        Ok(result)
    }

    pub fn with_key_store_transaction<T, E>(
        &self,
        operation: impl FnOnce(&KeyStoreTransaction<'_>) -> std::result::Result<T, E>,
    ) -> std::result::Result<T, E>
    where
        E: From<StorageError>,
    {
        self.database
            .write(|connection| operation(&KeyStoreTransaction { connection }))
    }

    pub fn load_encrypted_key_record(
        &self,
        profile_id: &str,
        provider: &str,
    ) -> Result<Option<EncryptedKeyRecord>> {
        self.database
            .read(|connection| KeyStoreTransaction { connection }.get(profile_id, provider))
    }

    pub fn update_last_trusted_reveal(&self) -> Result<()> {
        self.set_last_trusted_reveal(Utc::now())
    }

    pub fn invalidate_last_trusted_reveal(&self) -> Result<()> {
        self.set_last_trusted_reveal(Utc.with_ymd_and_hms(1990, 1, 1, 0, 0, 0).unwrap())
    }

    fn set_last_trusted_reveal(&self, timestamp: DateTime<Utc>) -> Result<()> {
        self.with_auth_update(|state| {
            state.last_trusted_reveal = Some(timestamp);
            Ok(())
        })
    }

    pub fn get_last_trusted_reveal(&self) -> Result<Option<DateTime<Utc>>> {
        Ok(self.auth.lock()?.load()?.last_trusted_reveal)
    }

    pub fn get_key_width(&self, profile_id: &str, provider: &str) -> Result<Option<u32>> {
        self.database.read(|connection| {
            Ok(connection
                .query_row(
                    "SELECT width FROM encrypted_keys WHERE profile_id = ?1 AND provider = ?2",
                    params![profile_id, provider],
                    |row| row.get(0),
                )
                .optional()?)
        })
    }

    pub fn delete_profile_key_records(&self, profile_id: &str) -> Result<bool> {
        self.with_key_store_transaction(|transaction| {
            transaction
                .connection
                .execute(
                    "DELETE FROM encrypted_keys WHERE profile_id = ?1",
                    [profile_id],
                )
                .map_err(StorageError::from)?;
            transaction.is_empty()
        })
    }

    pub fn get_active_profile_id(&self) -> Result<Option<String>> {
        Ok(self.profile_snapshot()?.active_profile_id)
    }

    pub fn set_active_profile_id(&self, profile_id: &str) -> Result<()> {
        self.with_auth_update(|state| {
            self.database.write(|connection| {
                if get_profile(connection, profile_id)?.is_none() {
                    return Err(StorageError::ProfileNotFound(profile_id.into()));
                }
                connection.execute(
                    "UPDATE profiles SET last_used_at = ?1 WHERE id = ?2",
                    params![Utc::now(), profile_id],
                )?;
                Ok(())
            })?;
            state.active_profile_id = Some(profile_id.into());
            Ok(())
        })
    }

    pub fn record_last_login(&self, last_login: LastLogin) -> Result<()> {
        let identity = ProfileIdentity::google(&last_login.issuer, &last_login.subject);
        if last_login.provider != GOOGLE_PROVIDER
            || last_login.profile_id != Profile::id_from_identity(&identity)
        {
            return Err(StorageError::InvalidProfileId(last_login.profile_id));
        }
        self.with_auth_update(|state| {
            self.database.write(|connection| {
                if get_profile(connection, &last_login.profile_id)?.is_none() {
                    return Err(StorageError::ProfileNotFound(last_login.profile_id.clone()));
                }
                connection.execute(
                    "UPDATE profiles SET last_used_at = ?1 WHERE id = ?2",
                    params![Utc::now(), last_login.profile_id],
                )?;
                Ok(())
            })?;
            state.active_profile_id = Some(last_login.profile_id.clone());
            state.last_login = Some(last_login);
            Ok(())
        })
    }

    pub fn clear_active_profile_id(&self) -> Result<()> {
        self.with_auth_update(|state| {
            state.active_profile_id = None;
            state.last_login = None;
            Ok(())
        })
    }

    pub fn upsert_profile(&self, profile: &Profile) -> Result<()> {
        validate_profile(profile)?;
        self.with_auth_update(|state| self.database.write(|connection| {
            let mut profile = profile.clone();
            if let Some(existing) = get_profile(connection, &profile.id)? {
                profile.created_at = existing.created_at;
                if profile.avatar_url.is_none() { profile.avatar_url = existing.avatar_url.clone(); }
                if profile.avatar_base64.is_none() && profile.avatar_url == existing.avatar_url {
                    profile.avatar_base64 = existing.avatar_base64;
                }
            }
            connection.execute(
                "INSERT INTO profiles (id, provider, issuer, subject, name, email, avatar_base64, avatar_url, created_at, last_used_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT (id) DO UPDATE SET provider = excluded.provider, issuer = excluded.issuer, subject = excluded.subject,
                 name = excluded.name, email = excluded.email, avatar_base64 = excluded.avatar_base64, avatar_url = excluded.avatar_url, last_used_at = excluded.last_used_at",
                params![profile.id, profile.identity.provider, profile.identity.issuer, profile.identity.subject, profile.name, profile.email, profile.avatar_base64, profile.avatar_url, profile.created_at, profile.last_used_at],
            )?;
            let active_exists = match state.active_profile_id.as_deref() {
                Some(id) => get_profile(connection, id)?.is_some(),
                None => false,
            };
            if !active_exists {
                state.active_profile_id = Some(profile.id);
            }
            Ok(())
        }))
    }

    pub fn get_profile(&self, profile_id: &str) -> Result<Option<Profile>> {
        self.database
            .read(|connection| get_profile(connection, profile_id))
    }

    pub fn get_active_profile(&self) -> Result<Option<Profile>> {
        Ok(self.profile_snapshot()?.active_profile)
    }

    pub fn profile_snapshot(&self) -> Result<ProfileSnapshot> {
        let guard = self.auth.lock()?;
        let state = guard.load()?;
        self.database
            .read(|connection| profile_snapshot(connection, state.active_profile_id))
    }

    pub fn delete_profile(&self, profile_id: &str) -> Result<()> {
        self.with_auth_update(|state| {
            self.database.write(|connection| {
                if get_profile(connection, profile_id)?.is_none() {
                    return Err(StorageError::ProfileNotFound(profile_id.into()));
                }
                let deleting_active = state.active_profile_id.as_deref() == Some(profile_id);
                connection.execute("DELETE FROM profiles WHERE id = ?1", [profile_id])?;
                if deleting_active {
                    let snapshot = profile_snapshot(connection, None)?;
                    state.active_profile_id =
                        snapshot.profiles.first().map(|profile| profile.id.clone());
                    if let Some(next_id) = state.active_profile_id.as_deref() {
                        connection.execute(
                            "UPDATE profiles SET last_used_at = ?1 WHERE id = ?2",
                            params![Utc::now(), next_id],
                        )?;
                    }
                }
                if state
                    .last_login
                    .as_ref()
                    .is_some_and(|login| login.profile_id == profile_id)
                {
                    state.last_login = None;
                }
                Ok(())
            })
        })
    }
}
