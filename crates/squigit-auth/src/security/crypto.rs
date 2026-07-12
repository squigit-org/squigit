// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use pbkdf2::pbkdf2;
use rand::{rngs::OsRng, RngCore};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;

use crate::{ProfileError, ProfileStore, Result};

use super::{validate_api_key, ApiKeyProvider};

type KeyFile = BTreeMap<String, BTreeMap<String, Value>>;

fn get_stable_passphrase() -> Result<String> {
    let home_dir = dirs::home_dir().ok_or(ProfileError::NoConfigDir)?;
    let home_str = home_dir.to_string_lossy();
    let mut hasher = Sha256::new();
    hasher.update(home_str.as_bytes());
    Ok(hex::encode(hasher.finalize()))
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let mut key = [0u8; 32];
    pbkdf2::<hmac::Hmac<Sha256>>(passphrase.as_bytes(), salt, 150_000, &mut key)
        .map_err(|err| ProfileError::Security(format!("PBKDF2 derivation failed: {}", err)))?;
    Ok(key)
}

fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn get_decrypted_key(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<Option<String>> {
    let file_path = store.get_keys_path();
    if !file_path.exists() {
        return Ok(None);
    }

    let file_content = fs::read_to_string(file_path)?;
    let key_file: KeyFile = serde_json::from_str(&file_content)?;
    let Some(payload) = key_file
        .get(profile_id)
        .and_then(|profile_keys| profile_keys.get(provider.storage_key_name()))
    else {
        return Ok(None);
    };

    let decode = |field: &str| -> Result<Vec<u8>> {
        let value = payload
            .get(field)
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                ProfileError::Security(format!("Encrypted key payload missing '{}'", field))
            })?;
        general_purpose::STANDARD.decode(value).map_err(|err| {
            ProfileError::Security(format!("Invalid base64 for '{}': {}", field, err))
        })
    };

    let salt = decode("salt")?;
    let iv = decode("iv")?;
    let tag = decode("tag")?;
    let ciphertext = decode("ciphertext")?;

    let passphrase = get_stable_passphrase()?;
    let key_bytes = derive_key(&passphrase, &salt)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv);

    let mut encrypted_data = ciphertext;
    encrypted_data.extend_from_slice(&tag);

    let plaintext_bytes = cipher
        .decrypt(nonce, encrypted_data.as_ref())
        .map_err(|_| ProfileError::Security("Failed to decrypt stored API key".to_string()))?;

    let plaintext = String::from_utf8(plaintext_bytes).map_err(|err| {
        ProfileError::Security(format!("Stored API key is not valid UTF-8: {}", err))
    })?;

    if let Some(expected_hash) = payload.get("sha256").and_then(|value| value.as_str()) {
        let actual_hash = sha256_hex(&plaintext);
        if expected_hash != actual_hash {
            return Err(ProfileError::Security(
                "Stored API key hash mismatch".to_string(),
            ));
        }
    }

    Ok(Some(plaintext))
}

pub fn encrypt_and_save_api_key(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
    plaintext: &str,
) -> Result<String> {
    if store.get_profile(profile_id)?.is_none() {
        return Err(ProfileError::ProfileNotFound(profile_id.to_string()));
    }

    let plaintext = plaintext.trim();
    validate_api_key(provider, plaintext)?;

    let passphrase = get_stable_passphrase()?;
    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut iv);

    let key_bytes = derive_key(&passphrase, &salt)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv);

    let encrypted_data = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|err| ProfileError::Security(format!("Encryption failed: {}", err)))?;

    let (ciphertext, tag) = encrypted_data.split_at(encrypted_data.len() - 16);
    let plaintext_hash = sha256_hex(plaintext);
    let payload = serde_json::json!({
        "version": 1,
        "algo": "aes-256-gcm",
        "sha256": plaintext_hash,
        "salt": general_purpose::STANDARD.encode(salt),
        "iv": general_purpose::STANDARD.encode(iv),
        "tag": general_purpose::STANDARD.encode(tag),
        "ciphertext": general_purpose::STANDARD.encode(ciphertext)
    });

    let file_path = store.get_keys_path();
    let mut key_file: KeyFile = if file_path.exists() {
        let file_content = fs::read_to_string(&file_path)?;
        serde_json::from_str(&file_content)?
    } else {
        KeyFile::default()
    };

    key_file
        .entry(profile_id.to_string())
        .or_default()
        .insert(provider.storage_key_name().to_string(), payload);
    store.write_json_atomic(&file_path, &key_file)?;

    Ok(file_path.to_string_lossy().to_string())
}
