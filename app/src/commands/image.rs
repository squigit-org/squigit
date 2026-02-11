// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::services::image;
use crate::state::AppState;
use ops_chat_storage::StoredImage;
use tauri::State;

#[tauri::command]
pub fn get_initial_image(state: State<AppState>) -> Option<StoredImage> {
    let image_lock = state.image_data.lock();
    image_lock.clone()
}

#[tauri::command]
pub fn process_image_path(path: String, state: State<AppState>) -> Result<StoredImage, String> {
    image::process_and_store_image(path, &state)
}

#[tauri::command]
pub fn process_image_bytes(bytes: Vec<u8>, state: State<AppState>) -> Result<StoredImage, String> {
    image::process_bytes_internal(bytes, &state)
}

#[tauri::command]
pub fn read_image_file(path: String, state: State<AppState>) -> Result<StoredImage, String> {
    image::process_and_store_image(path, &state)
}

#[tauri::command]
pub fn copy_image_to_path(source_path: String, target_path: String) -> Result<(), String> {
    std::fs::copy(&source_path, &target_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Read;
    use base64::{engine::general_purpose, Engine as _};

    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    Ok(general_purpose::STANDARD.encode(&buffer))
}
