// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::state::AppState;
use ops_chat_storage::{ChatStorage, StoredImage};
use std::fs::File;
use std::io::Read;
use tauri::State;

pub fn process_and_store_image(
    path: String,
    state: &State<AppState>,
) -> Result<StoredImage, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    process_bytes_internal(buffer, state)
}

pub fn process_bytes_internal(
    buffer: Vec<u8>,
    state: &State<AppState>,
) -> Result<StoredImage, String> {
    if buffer.is_empty() {
        return Err("Empty image buffer".to_string());
    }

    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    let stored = storage.store_image(&buffer).map_err(|e| e.to_string())?;

    let mut image_lock = state.image_data.lock();
    *image_lock = Some(stored.clone());

    Ok(stored)
}
