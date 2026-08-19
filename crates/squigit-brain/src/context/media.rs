// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_storage::{StoredImage, ThreadStorage};

pub fn get_active_storage() -> Result<ThreadStorage, String> {
    ThreadStorage::new().map_err(|e| e.to_string())
}

pub fn process_bytes_internal(
    buffer: Vec<u8>,
    explicit_tone: Option<String>,
) -> Result<StoredImage, String> {
    if buffer.is_empty() {
        return Err("Empty image buffer".to_string());
    }

    let storage = get_active_storage()?;
    let stored = storage
        .store_image(&buffer, explicit_tone)
        .map_err(|e| e.to_string())?;

    Ok(stored)
}

pub fn process_and_store_image(
    path: &str,
    explicit_tone: Option<String>,
) -> Result<StoredImage, String> {
    get_active_storage()?
        .store_image_from_path(path, explicit_tone)
        .map_err(|error| error.to_string())
}
