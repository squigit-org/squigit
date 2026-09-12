// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Error types for profile storage operations.

use std::fmt;
use std::io;
use thiserror::Error;

/// Result type alias for profile operations.
pub type Result<T> = std::result::Result<T, ProfileError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ByokErrorCode {
    VaultUnavailable,
    VaultLocked,
    VaultDenied,
    MasterKeyMissing,
    CasBindingKeyMissing,
    MalformedKeyStore,
    InvalidCredential,
    EncryptionFailed,
}

impl ByokErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::VaultUnavailable => "vault-unavailable",
            Self::VaultLocked => "vault-locked",
            Self::VaultDenied => "vault-denied",
            Self::MasterKeyMissing => "master-key-missing",
            Self::CasBindingKeyMissing => "cas-binding-key-missing",
            Self::MalformedKeyStore => "malformed-key-store",
            Self::InvalidCredential => "invalid-credential",
            Self::EncryptionFailed => "encryption-failed",
        }
    }
}

impl fmt::Display for ByokErrorCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Errors that can occur during profile operations.
#[derive(Debug, Error)]
pub enum ProfileError {
    /// Profile with the given ID was not found.
    #[error("Profile not found: {0}")]
    ProfileNotFound(String),

    /// API key provider name is unknown.
    #[error("Invalid API key provider: {0}")]
    InvalidProvider(String),

    /// Google authentication is not configured.
    #[error("{0}")]
    MissingCredentials(String),

    /// Authentication flow failed.
    #[error("{0}")]
    Auth(String),

    /// Stable BYOK failure code plus a safe human-readable explanation.
    #[error("{code}: {message}")]
    Byok {
        code: ByokErrorCode,
        message: String,
    },

    /// IO error during file operations.
    #[error("IO error: {0}")]
    Io(#[from] io::Error),

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Profile/auth/key persistence failure from squigit-storage.
    #[error("{0}")]
    Storage(#[from] squigit_storage::StorageError),

    /// HTTP or network failure during auth/avatar fetches.
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    /// Invalid URL encountered during auth flow construction/parsing.
    #[error("URL error: {0}")]
    Url(#[from] url::ParseError),
}

impl ProfileError {
    pub fn byok(code: ByokErrorCode, message: impl Into<String>) -> Self {
        Self::Byok {
            code,
            message: message.into(),
        }
    }
}
