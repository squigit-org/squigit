/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use crate::utils::get_app_config_dir;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use pbkdf2::pbkdf2;
use sha2::{Digest, Sha256};
use std::fs;
use tauri::AppHandle;

pub fn get_stable_passphrase() -> String {
    let home_dir = dirs::home_dir().expect("Could not find home directory");
    let home_str = home_dir.to_string_lossy();
    let mut hasher = Sha256::new();
    hasher.update(home_str.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::<hmac::Hmac<Sha256>>(passphrase.as_bytes(), salt, 150_000, &mut key)
        .expect("PBKDF2 derivation failed");
    key
}

pub fn get_decrypted_key_internal(app: &AppHandle, provider: &str) -> Option<String> {
    let config_dir = get_app_config_dir(app);
    let file_path = config_dir.join(format!("{}_key.json", provider));

    if !file_path.exists() {
        return None;
    }

    let file_content = fs::read_to_string(file_path).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&file_content).ok()?;

    let salt = general_purpose::STANDARD
        .decode(payload["salt"].as_str()?)
        .ok()?;
    let iv = general_purpose::STANDARD
        .decode(payload["iv"].as_str()?)
        .ok()?;
    let tag = general_purpose::STANDARD
        .decode(payload["tag"].as_str()?)
        .ok()?;
    let ciphertext = general_purpose::STANDARD
        .decode(payload["ciphertext"].as_str()?)
        .ok()?;

    let passphrase = get_stable_passphrase();
    let key_bytes = derive_key(&passphrase, &salt);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv);

    let mut encrypted_data = ciphertext;
    encrypted_data.extend_from_slice(&tag);

    let plaintext_bytes = cipher.decrypt(nonce, encrypted_data.as_ref()).ok()?;

    String::from_utf8(plaintext_bytes).ok()
}
