// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Chat storage Tauri commands.

use ops_chat_storage::{
    ChatData, ChatMessage, ChatMetadata, ChatStorage, OcrFrame, OcrRegion, StoredImage,
};
use ops_profile_store::ProfileStore;

/// Helper to get storage for the active profile.
fn get_active_storage() -> Result<ChatStorage, String> {
    let profile_store = ProfileStore::new().map_err(|e| e.to_string())?;
    let active_id = profile_store
        .get_active_profile_id()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active profile. Please log in first.".to_string())?;
    
    let chats_dir = profile_store.get_chats_dir(&active_id);
    ChatStorage::with_base_dir(chats_dir).map_err(|e| e.to_string())
}

// =============================================================================
// Image Storage Commands
// =============================================================================

/// Store image bytes and return hash + path.
#[tauri::command]
pub fn store_image_bytes(bytes: Vec<u8>) -> Result<StoredImage, String> {
    let storage = get_active_storage()?;
    storage.store_image(&bytes).map_err(|e| e.to_string())
}

/// Store image from file path and return hash + path.
#[tauri::command]
pub fn store_image_from_path(path: String) -> Result<StoredImage, String> {
    let storage = get_active_storage()?;
    storage.store_image_from_path(&path).map_err(|e| e.to_string())
}

/// Store any file from path (preserving extension) and return hash + CAS path.
#[tauri::command]
pub fn store_file_from_path(path: String) -> Result<StoredImage, String> {
    let storage = get_active_storage()?;
    storage.store_file_from_path(&path).map_err(|e| e.to_string())
}

/// Validate if a file is safe text (valid UTF-8 and no null bytes).
#[tauri::command]
pub fn validate_text_file(path: String) -> Result<bool, String> {
    use std::fs::File;
    use std::io::Read;

    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; 8192];  // Read up to 8KB
    let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(bytes_read);

    // Empty files are valid text files
    if bytes_read == 0 {
        return Ok(true);
    }

    // Check for null bytes (quick binary check)
    if buffer.contains(&0) {
        return Ok(false);
    }

    // Check strict UTF-8 validity
    match std::str::from_utf8(&buffer) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Get the path to a stored image by its hash.
#[tauri::command]
pub fn get_image_path(hash: String) -> Result<String, String> {
    let storage = get_active_storage()?;
    storage.get_image_path(&hash).map_err(|e| e.to_string())
}

// =============================================================================
// Chat Storage Commands
// =============================================================================

/// Create a new chat with the given image hash.
#[tauri::command]
pub fn create_chat(title: String, image_hash: String) -> Result<ChatMetadata, String> {
    let storage = get_active_storage()?;
    let metadata = ChatMetadata::new(title, image_hash, None);
    let chat = ChatData::new(metadata.clone());
    storage.save_chat(&chat).map_err(|e| e.to_string())?;
    Ok(metadata)
}

/// Load a chat by ID.
#[tauri::command]
pub fn load_chat(chat_id: String) -> Result<ChatData, String> {
    let storage = get_active_storage()?;
    storage.load_chat(&chat_id).map_err(|e| e.to_string())
}

/// List all chats (metadata only).
#[tauri::command]
pub fn list_chats() -> Result<Vec<ChatMetadata>, String> {
    let storage = get_active_storage()?;
    storage.list_chats().map_err(|e| e.to_string())
}

/// Delete a chat by ID.
#[tauri::command]
pub fn delete_chat(chat_id: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage.delete_chat(&chat_id).map_err(|e| e.to_string())
}

/// Update chat metadata (rename, pin, star, etc.).
#[tauri::command]
pub fn update_chat_metadata(metadata: ChatMetadata) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage.update_chat_metadata(&metadata).map_err(|e| e.to_string())
}

// =============================================================================
// Message Commands
// =============================================================================

#[tauri::command]
pub fn append_chat_message(chat_id: String, role: String, content: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    let message = if role == "user" {
        ChatMessage::user(content)
    } else {
        ChatMessage::assistant(content)
    };
    storage.append_message(&chat_id, &message).map_err(|e| e.to_string())
}

/// Overwrite all messages in a chat.
#[tauri::command]
pub fn overwrite_chat_messages(chat_id: String, messages: Vec<ChatMessage>) -> Result<(), String> {
    let storage = get_active_storage()?;
    let mut chat = storage.load_chat(&chat_id).map_err(|e| e.to_string())?;
    chat.messages = messages;
    storage.save_chat(&chat).map_err(|e| e.to_string())
}

// =============================================================================
// OCR Commands
// =============================================================================

/// Save OCR data for a specific model.
#[tauri::command]
pub fn save_ocr_data(chat_id: String, model_id: String, ocr_data: Vec<OcrRegion>) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage.save_ocr_data(&chat_id, &model_id, &ocr_data).map_err(|e| e.to_string())
}

/// Get OCR data for a specific model.
#[tauri::command]
pub fn get_ocr_data(chat_id: String, model_id: String) -> Result<Option<Vec<OcrRegion>>, String> {
    let storage = get_active_storage()?;
    storage.get_ocr_data(&chat_id, &model_id).map_err(|e| e.to_string())
}

/// Get the entire OCR frame for a chat.
#[tauri::command]
pub fn get_ocr_frame(chat_id: String) -> Result<OcrFrame, String> {
    let storage = get_active_storage()?;
    storage.get_ocr_frame(&chat_id).map_err(|e| e.to_string())
}

/// Initialize OCR frame with null values for given model IDs.
#[tauri::command]
pub fn init_ocr_frame(chat_id: String, model_ids: Vec<String>) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage.init_ocr_frame(&chat_id, &model_ids).map_err(|e| e.to_string())
}

// =============================================================================
// ImgBB Commands
// =============================================================================

/// Save imgbb URL for a chat.
#[tauri::command]
pub fn save_imgbb_url(chat_id: String, url: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage.save_imgbb_url(&chat_id, &url).map_err(|e| e.to_string())
}

/// Get imgbb URL for a chat.
#[tauri::command]
pub fn get_imgbb_url(chat_id: String) -> Result<Option<String>, String> {
    let storage = get_active_storage()?;
    storage.get_imgbb_url(&chat_id).map_err(|e| e.to_string())
}

