// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};

use super::types::{LastLogin, Profile, ProfileIdentity, GOOGLE_PROVIDER};
use crate::{Result, StorageError};

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct AuthState {
    pub active_profile_id: Option<String>,
    pub last_login: Option<LastLogin>,
    pub last_trusted_reveal: Option<DateTime<Utc>>,
}

impl AuthState {
    fn validate(&self) -> Result<()> {
        if let Some(profile_id) = &self.active_profile_id {
            if !Profile::is_canonical_id(profile_id) {
                return Err(StorageError::InvalidProfileId(profile_id.clone()));
            }
        }
        if let Some(login) = &self.last_login {
            let identity = ProfileIdentity::google(&login.issuer, &login.subject);
            if login.provider != GOOGLE_PROVIDER
                || login.profile_id != Profile::id_from_identity(&identity)
            {
                return Err(StorageError::InvalidProfileId(login.profile_id.clone()));
            }
        }
        Ok(())
    }
}

pub(super) struct AuthStore {
    path: PathBuf,
    lock_path: PathBuf,
}

impl AuthStore {
    pub fn new(root: &Path) -> Result<Self> {
        let store = Self {
            path: root.join("auth.json"),
            lock_path: root.join("auth.lock"),
        };
        let guard = store.lock()?;
        match fs::symlink_metadata(&store.path) {
            Ok(_) => {
                guard.load()?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                guard.save(&AuthState::default())?;
            }
            Err(error) => return Err(error.into()),
        }
        drop(guard);
        Ok(store)
    }

    pub fn lock(&self) -> Result<AuthStoreGuard<'_>> {
        reject_unsafe_path(&self.lock_path)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock_file = options.open(&self.lock_path)?;
        set_private_permissions(&self.lock_path)?;
        lock_file.lock_exclusive()?;
        Ok(AuthStoreGuard {
            path: &self.path,
            lock_file,
        })
    }
}

pub(super) struct AuthStoreGuard<'a> {
    path: &'a Path,
    lock_file: File,
}

impl AuthStoreGuard<'_> {
    pub fn load(&self) -> Result<AuthState> {
        reject_unsafe_path(self.path)?;
        let contents = match fs::read(self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(AuthState::default());
            }
            Err(error) => return Err(error.into()),
        };
        set_private_permissions(self.path)?;
        let state: AuthState = serde_json::from_slice(&contents)?;
        state.validate()?;
        Ok(state)
    }

    pub fn save(&self, state: &AuthState) -> Result<()> {
        state.validate()?;
        reject_unsafe_path(self.path)?;
        let parent = self
            .path
            .parent()
            .ok_or_else(|| StorageError::AuthState("auth.json has no parent directory".into()))?;
        let temporary = parent.join(format!(".auth.json.tmp-{}", uuid::Uuid::new_v4()));
        let mut contents = serde_json::to_vec_pretty(state)?;
        contents.push(b'\n');
        let result = (|| -> Result<()> {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temporary)?;
            file.write_all(&contents)?;
            file.sync_all()?;
            drop(file);
            crate::secure_file::replace_file(&temporary, self.path)?;
            crate::secure_file::sync_parent(parent)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}

impl Drop for AuthStoreGuard<'_> {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.lock_file);
    }
}

fn reject_unsafe_path(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => Err(
            StorageError::AuthState(format!("Invalid auth file: {}", path.display())),
        ),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn set_private_permissions(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
