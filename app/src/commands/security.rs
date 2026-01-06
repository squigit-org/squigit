/*
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand::{rngs::OsRng, RngCore};
use std::fs::{self, File};
use std::io::Write;
use tauri::{AppHandle, Manager};

use crate::services::security;
use crate::utils::get_app_config_dir;

#[tauri::command]
pub async fn encrypt_and_save(
    app: AppHandle,
    plaintext: String,
    provider: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let passphrase = security::get_stable_passphrase();
        let mut salt = [0u8; 16];
        let mut iv = [0u8; 12];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut iv);

        let key_bytes = security::derive_key(&passphrase, &salt);
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&iv);

        let encrypted_data = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        let (ciphertext, tag) = encrypted_data.split_at(encrypted_data.len() - 16);

        let payload = serde_json::json!({
            "version": 1,
            "algo": "aes-256-gcm",
            "salt": general_purpose::STANDARD.encode(salt),
            "iv": general_purpose::STANDARD.encode(iv),
            "tag": general_purpose::STANDARD.encode(tag),
            "ciphertext": general_purpose::STANDARD.encode(ciphertext)
        });

        let config_dir = get_app_config_dir(&app);
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }

        let file_path = config_dir.join(format!("{}_key.json", provider));
        let mut file = File::create(&file_path).map_err(|e| e.to_string())?;

        file.write_all(serde_json::to_string_pretty(&payload).unwrap().as_bytes())
            .map_err(|e| e.to_string())?;

        if provider == "imgbb" {
            if let Some(win) = app.get_webview_window("imgbb-setup") {
                let _ = win.close();
            }
        }

        Ok(file_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn check_file_exists(app: AppHandle, filename: String) -> bool {
    let path = get_app_config_dir(&app).join(filename);
    path.exists()
}
