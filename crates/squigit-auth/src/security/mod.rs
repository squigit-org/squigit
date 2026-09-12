// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod api_keys;
mod crypto;
mod reveal;
mod vault;

pub use api_keys::{validate_api_key, ApiKeyProvider};
pub use crypto::{
    delete_api_key, encrypt_and_save_api_key, get_api_key_status, get_decrypted_api_key,
    object_remote_id, reveal_api_key, CredentialDigest, DecryptedApiKey, SecretString,
};
pub use reveal::{check_reveal_authorization, RevealAuthResult};
