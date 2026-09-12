// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub mod auth;
pub mod error;
pub mod security;

pub use auth::{AuthFlowSettings, BrowserOpener, CredentialsSource, GoogleAuthAttempt};
pub use error::{ByokErrorCode, ProfileError, Result};
pub use security::{
    check_reveal_authorization, delete_api_key, encrypt_and_save_api_key, get_api_key_status,
    get_decrypted_api_key, object_remote_id, reveal_api_key, validate_api_key, ApiKeyProvider,
    CredentialDigest, DecryptedApiKey, RevealAuthResult, SecretString,
};
