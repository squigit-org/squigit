// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Security — API key encryption/decryption.

use std::str::FromStr;
use squigit_auth::security::ApiKeyProvider;
use squigit_auth::ProfileStore;

// =============================================================================
// API Key Encryption
// =============================================================================

pub fn encrypt_and_save(profile_id: &str, provider: &str, plaintext: &str) -> Result<(), String> {
    let store = ProfileStore::new().map_err(|err| err.to_string())?;
    let provider = ApiKeyProvider::from_str(provider).map_err(|err| err.to_string())?;
    squigit_auth::security::encrypt_and_save_key(&store, profile_id, provider, plaintext)
        .map(|_| ())
        .map_err(|err| err.to_string())
}
