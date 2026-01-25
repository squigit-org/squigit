// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Chat storage Tauri commands.

use ops_chat_storage::{
    ChatData, ChatMessage, ChatMetadata, ChatStorage, OcrRegion, Project, StoredImage,
};

// =============================================================================
// Image Storage Commands
// =============================================================================

/// Store image bytes and return hash + path.
#[tauri::command]
pub fn store_image_bytes(bytes: Vec<u8>) -> Result<StoredImage, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.store_image(&bytes).map_err(|e| e.to_string())
}

/// Store image from file path and return hash + path.
#[tauri::command]
pub fn store_image_from_path(path: String) -> Result<StoredImage, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.store_image_from_path(&path).map_err(|e| e.to_string())
}

/// Get the path to a stored image by its hash.
#[tauri::command]
pub fn get_image_path(hash: String) -> Result<String, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.get_image_path(&hash).map_err(|e| e.to_string())
}

// =============================================================================
// Chat Storage Commands
// =============================================================================

/// Create a new chat with the given image hash.
#[tauri::command]
pub fn create_chat(title: String, image_hash: String) -> Result<ChatMetadata, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    let metadata = ChatMetadata::new(title, image_hash);
    let chat = ChatData::new(metadata.clone());
    storage.save_chat(&chat).map_err(|e| e.to_string())?;
    Ok(metadata)
}

/// Load a chat by ID.
#[tauri::command]
pub fn load_chat(chat_id: String) -> Result<ChatData, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.load_chat(&chat_id).map_err(|e| e.to_string())
}

/// List all chats (metadata only).
#[tauri::command]
pub fn list_chats() -> Result<Vec<ChatMetadata>, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.list_chats().map_err(|e| e.to_string())
}

/// Delete a chat by ID.
#[tauri::command]
pub fn delete_chat(chat_id: String) -> Result<(), String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.delete_chat(&chat_id).map_err(|e| e.to_string())
}

/// Update chat metadata (rename, pin, star, etc.).
#[tauri::command]
pub fn update_chat_metadata(metadata: ChatMetadata) -> Result<(), String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.update_chat_metadata(&metadata).map_err(|e| e.to_string())
}

// =============================================================================
// Message Commands
// =============================================================================

#[tauri::command]
pub fn append_chat_message(chat_id: String, role: String, content: String) -> Result<(), String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
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
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    let mut chat = storage.load_chat(&chat_id).map_err(|e| e.to_string())?;
    chat.messages = messages;
    storage.save_chat(&chat).map_err(|e| e.to_string())
}

// =============================================================================
// OCR Commands
// =============================================================================

/// Save OCR data for a chat.
#[tauri::command]
pub fn save_ocr_data(chat_id: String, ocr_data: Vec<OcrRegion>) -> Result<(), String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.save_ocr_data(&chat_id, &ocr_data).map_err(|e| e.to_string())
}

/// Get OCR data for a chat.
#[tauri::command]
pub fn get_ocr_data(chat_id: String) -> Result<Vec<OcrRegion>, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.get_ocr_data(&chat_id).map_err(|e| e.to_string())
}

// =============================================================================
// ImgBB Commands
// =============================================================================

/// Save imgbb URL for a chat.
#[tauri::command]
pub fn save_imgbb_url(chat_id: String, url: String) -> Result<(), String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.save_imgbb_url(&chat_id, &url).map_err(|e| e.to_string())
}

/// Get imgbb URL for a chat.
#[tauri::command]
pub fn get_imgbb_url(chat_id: String) -> Result<Option<String>, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.get_imgbb_url(&chat_id).map_err(|e| e.to_string())
}

// =============================================================================
// Project Commands
// =============================================================================

/// List all projects.
#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.list_projects().map_err(|e| e.to_string())
}

/// Create a new project.
#[tauri::command]
pub fn create_project(name: String) -> Result<Project, String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.create_project(name).map_err(|e| e.to_string())
}

/// Delete a project.
#[tauri::command]
pub fn delete_project(project_id: String) -> Result<(), String> {
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    storage.delete_project(&project_id).map_err(|e| e.to_string())
}
