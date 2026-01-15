// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::State;
use crate::services::image;
use crate::state::AppState;

#[tauri::command]
pub fn get_initial_image(state: State<AppState>) -> Option<String> {
    let image_lock = state.image_data.lock();
    image_lock.clone()
}

#[tauri::command]
pub fn process_image_path(path: String) -> Result<serde_json::Value, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File does not exist".into());
    }
    let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
    Ok(serde_json::json!({
        "path": path,
        "mimeType": mime
    }))
}

#[tauri::command]
pub fn process_image_bytes(bytes: Vec<u8>, state: State<AppState>) -> Result<String, String> {
    image::process_bytes_internal(bytes, &state)
}

#[tauri::command]
pub fn read_image_file(path: String, state: State<AppState>) -> Result<serde_json::Value, String> {
    let base64 = image::process_and_store_image(&path, &state)?;

    let parts: Vec<&str> = base64.splitn(2, ",").collect();
    let mime_type = parts[0].replace("data:", "").replace(";base64", "");

    Ok(serde_json::json!({
        "base64": base64,
        "mimeType": mime_type
    }))
}
