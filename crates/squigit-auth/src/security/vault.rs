// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use keyring::v1::Entry;
use zeroize::{Zeroize, Zeroizing};

use crate::{ByokErrorCode, ProfileError, Result};

pub const VAULT_SERVICE: &str = "org.squigit.byok";
pub const RECORD_ENCRYPTION_MASTER_ACCOUNT: &str = "record-encryption-master-v1";
pub const CAS_BINDING_KEY_ACCOUNT: &str = "cas-binding-key-v1";
pub const VAULT_KEY_LENGTH: usize = 32;

pub struct VaultKey(Zeroizing<[u8; VAULT_KEY_LENGTH]>);

impl std::fmt::Debug for VaultKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("VaultKey([REDACTED])")
    }
}

impl VaultKey {
    pub fn from_bytes(mut bytes: Vec<u8>) -> Result<Self> {
        if bytes.len() != VAULT_KEY_LENGTH {
            bytes.zeroize();
            return Err(ProfileError::byok(
                ByokErrorCode::VaultUnavailable,
                "The OS vault returned a malformed Squigit secret.",
            ));
        }
        let mut key = [0u8; VAULT_KEY_LENGTH];
        key.copy_from_slice(&bytes);
        bytes.zeroize();
        Ok(Self(Zeroizing::new(key)))
    }

    pub fn expose(&self) -> &[u8; VAULT_KEY_LENGTH] {
        &self.0
    }
}

pub trait SecretVault {
    fn get(&self, account: &str) -> Result<Option<VaultKey>>;
    fn set(&self, account: &str, secret: &[u8; VAULT_KEY_LENGTH]) -> Result<()>;
    fn delete(&self, account: &str) -> Result<()>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct OsSecretVault;

impl OsSecretVault {
    fn entry(account: &str) -> Result<Entry> {
        Entry::new(VAULT_SERVICE, account).map_err(map_vault_error)
    }
}

impl SecretVault for OsSecretVault {
    fn get(&self, account: &str) -> Result<Option<VaultKey>> {
        match Self::entry(account)?.get_secret() {
            Ok(secret) => VaultKey::from_bytes(secret).map(Some),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(map_vault_error(error)),
        }
    }

    fn set(&self, account: &str, secret: &[u8; VAULT_KEY_LENGTH]) -> Result<()> {
        Self::entry(account)?
            .set_secret(secret)
            .map_err(map_vault_error)
    }

    fn delete(&self, account: &str) -> Result<()> {
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(map_vault_error(error)),
        }
    }
}

fn map_vault_error(error: keyring::Error) -> ProfileError {
    let message = error.to_string();
    let lowercase = message.to_ascii_lowercase();
    let code = if lowercase.contains("locked") {
        ByokErrorCode::VaultLocked
    } else if lowercase.contains("denied")
        || lowercase.contains("cancel")
        || lowercase.contains("permission")
    {
        ByokErrorCode::VaultDenied
    } else {
        ByokErrorCode::VaultUnavailable
    };

    ProfileError::byok(
        code,
        "The OS secure vault is locked, unavailable, or denied access.",
    )
}
