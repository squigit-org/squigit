// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod api_keys;
mod crypto;
mod ota;

pub use api_keys::{validate_api_key, ApiKeyProvider};
pub use crypto::{
    encrypt_and_save_api_key, get_decrypted_api_key, get_decrypted_key, google_api_key_fingerprint,
    verify_google_api_key_fingerprint, DecryptedApiKey,
};
pub use ota::verify_artifact_signature;
