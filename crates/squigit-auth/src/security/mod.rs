// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod api_keys;
mod crypto;
mod ota;
mod reveal;
mod vault;

pub use api_keys::{validate_api_key, ApiKeyProvider};
pub use crypto::{
    delete_api_key, delete_api_key_with_vault, encrypt_and_save_api_key,
    encrypt_and_save_api_key_with_vault, frame, get_api_key_status, get_decrypted_api_key,
    get_decrypted_api_key_with_vault, object_remote_id, reset_remote_cache_security,
    reveal_api_key, CredentialDigest, DecryptedApiKey, SecretString,
};
pub use ota::verify_artifact_signature;
pub use reveal::{
    check_reveal_authorization, invalidate_reveal_grace, RevealAuthResult, RevealShell,
};
pub use vault::{
    OsSecretVault, SecretVault, VaultKey, CAS_BINDING_KEY_ACCOUNT,
    RECORD_ENCRYPTION_MASTER_ACCOUNT, VAULT_KEY_LENGTH, VAULT_SERVICE,
};
