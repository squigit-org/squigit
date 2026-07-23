// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use squigit_storage::ProfileStore;

use crate::{ProfileError, Result};

use super::{validate_api_key, ApiKeyProvider};

const ENCRYPTED_KEY_PAYLOAD_VERSION: u64 = 2;
const GOOGLE_API_KEY_FINGERPRINT_PREFIX: &str = "gai_v1_";
const GOOGLE_API_KEY_FINGERPRINT_DOMAIN: &[u8] = b"squigit\0google-ai-studio\0object-remote\0v1";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecryptedApiKey {
    pub api_key: String,
    pub key_fingerprint: String,
    pub encrypted_key_ref: String,
}

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

/// Returns the stable identity used for Google API-key-scoped remote objects.
///
/// The fingerprint intentionally depends only on the normalized API key. It is
/// independent of profile IDs and randomized encryption metadata.
pub fn google_api_key_fingerprint(api_key: &str) -> String {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(api_key.trim().as_bytes())
        .expect("HMAC-SHA256 accepts keys of any size");
    mac.update(GOOGLE_API_KEY_FINGERPRINT_DOMAIN);
    let digest = mac.finalize().into_bytes();
    format!(
        "{GOOGLE_API_KEY_FINGERPRINT_PREFIX}{}",
        general_purpose::URL_SAFE_NO_PAD.encode(digest)
    )
}

/// Verifies a stored Google API-key fingerprint in constant time.
pub fn verify_google_api_key_fingerprint(api_key: &str, fingerprint: &str) -> bool {
    let Some(encoded) = fingerprint.strip_prefix(GOOGLE_API_KEY_FINGERPRINT_PREFIX) else {
        return false;
    };
    let Ok(expected) = general_purpose::URL_SAFE_NO_PAD.decode(encoded) else {
        return false;
    };

    let mut mac = <HmacSha256 as Mac>::new_from_slice(api_key.trim().as_bytes())
        .expect("HMAC-SHA256 accepts keys of any size");
    mac.update(GOOGLE_API_KEY_FINGERPRINT_DOMAIN);
    mac.verify_slice(&expected).is_ok()
}

pub fn get_decrypted_api_key(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<Option<DecryptedApiKey>> {
    let Some(payload) =
        store.load_encrypted_key_payload(profile_id, provider.storage_key_name())?
    else {
        return Ok(None);
    };

    if payload.get("version").and_then(|value| value.as_u64())
        != Some(ENCRYPTED_KEY_PAYLOAD_VERSION)
    {
        return Err(ProfileError::Security(
            "Unsupported encrypted API key payload version".to_string(),
        ));
    }

    let key_fingerprint = payload
        .get("key_fingerprint")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ProfileError::Security("Encrypted key payload missing 'key_fingerprint'".to_string())
        })?
        .to_string();
    let encrypted_key_ref = payload
        .get("ciphertext")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ProfileError::Security("Encrypted key payload missing 'ciphertext'".to_string())
        })?
        .to_string();

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
    let api_key = plaintext.trim().to_string();

    if !verify_google_api_key_fingerprint(&api_key, &key_fingerprint) {
        return Err(ProfileError::Security(
            "Stored API key fingerprint mismatch".to_string(),
        ));
    }

    Ok(Some(DecryptedApiKey {
        api_key,
        key_fingerprint,
        encrypted_key_ref,
    }))
}

pub fn get_decrypted_key(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<Option<String>> {
    Ok(get_decrypted_api_key(store, provider, profile_id)?.map(|credential| credential.api_key))
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
    let key_fingerprint = google_api_key_fingerprint(plaintext);
    let payload = serde_json::json!({
        "version": ENCRYPTED_KEY_PAYLOAD_VERSION,
        "algo": "aes-256-gcm",
        "key_fingerprint": key_fingerprint,
        "salt": general_purpose::STANDARD.encode(salt),
        "iv": general_purpose::STANDARD.encode(iv),
        "tag": general_purpose::STANDARD.encode(tag),
        "ciphertext": general_purpose::STANDARD.encode(ciphertext)
    });

    store.save_encrypted_key_payload(profile_id, provider.storage_key_name(), payload)?;

    Ok(store
        .get_provider_key_path(profile_id, provider.storage_key_name())
        .to_string_lossy()
        .to_string())
}
