// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Security — API key encryption/decryption and agreement flag management.
//! Uses `dirs` crate for config path resolution (no Tauri dependency).

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

// =============================================================================
// Agreement Flag (uses dirs crate, not Tauri paths)
// =============================================================================

fn get_config_dir() -> Result<std::path::PathBuf, String> {
    dirs::config_dir()
        .map(|p| p.join("Squigit"))
        .ok_or_else(|| "Could not resolve app config dir".to_string())
}

pub fn set_agreed_flag() -> Result<(), String> {
    let config_dir = get_config_dir()?;

    if !config_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&config_dir) {
            return Err(format!("Failed to create config dir: {}", e));
        }
    }
    let marker_file = config_dir.join(".agreed");
    if let Err(e) = std::fs::write(&marker_file, "") {
        log::error!("Failed to create .agreed marker file: {}", e);
        Err(format!("Failed to create .agreed marker file: {}", e))
    } else {
        log::info!("Successfully created .agreed marker file");
        Ok(())
    }
}

pub fn has_agreed_flag() -> bool {
    match get_config_dir() {
        Ok(config_dir) => config_dir.join(".agreed").exists(),
        Err(e) => {
            log::error!("Could not resolve app config dir: {}", e);
            false
        }
    }
}

pub fn check_file_exists(path: &str) -> bool {
    std::path::Path::new(path).exists()
}
