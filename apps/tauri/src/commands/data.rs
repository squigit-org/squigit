// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Chat storage, OCR storage, imgbb storage, rolling summaries.
//! All pure data CRUD — zero Tauri API calls beyond #[tauri::command].

use ops_chat_storage::{
    ChatData, ChatMessage, ChatMetadata, ChatStorage, OcrFrame, OcrRegion, StoredImage,
};
use ops_squigit_brain::tools::chat_search::{search_local_chats, ChatSearchResult};

fn get_active_storage() -> Result<ChatStorage, String> {
    ops_squigit_brain::context::media::get_active_storage()
}

// =============================================================================
// Image Storage Commands
// =============================================================================

#[tauri::command]
pub fn store_image_bytes(bytes: Vec<u8>) -> Result<StoredImage, String> {
    let explicit_tone = ops_host_runtime::media::detect_image_tone_from_bytes(&bytes);
    ops_squigit_brain::context::media::process_bytes_internal(bytes, explicit_tone)
}

#[tauri::command]
pub fn store_image_from_path(path: String) -> Result<StoredImage, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let explicit_tone = ops_host_runtime::media::detect_image_tone_from_bytes(&bytes);
    ops_squigit_brain::context::media::process_bytes_internal(bytes, explicit_tone)
}

#[tauri::command]
pub fn store_file_from_path(path: String) -> Result<StoredImage, String> {
    let storage = get_active_storage()?;
    storage
        .store_file_from_path(&path, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_text_file(path: String) -> Result<bool, String> {
    ops_squigit_brain::provider::attachments::validate_text_file(&path)
}

#[tauri::command]
pub fn get_image_path(hash: String) -> Result<String, String> {
    let storage = get_active_storage()?;
    storage.get_image_path(&hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_attachment_path(path: String) -> Result<String, String> {
    ops_squigit_brain::provider::attachments::resolve_attachment_path(&path)
}

#[tauri::command]
pub fn detect_image_tone(path: String) -> Result<String, String> {
    let resolved =
        ops_squigit_brain::provider::attachments::resolve_attachment_path_buf(&path)?;
    let bytes = std::fs::read(resolved).map_err(|e| e.to_string())?;

    match ops_host_runtime::media::detect_image_tone_from_bytes(&bytes).as_deref() {
        Some("l") => Ok("light".to_string()),
        Some("d") => Ok("dark".to_string()),
        Some(other) => Ok(other.to_string()),
        None => Err("Failed to detect image tone".to_string()),
    }
}

#[tauri::command]
pub fn read_attachment_text(path: String) -> Result<String, String> {
    ops_squigit_brain::provider::attachments::read_attachment_text(&path)
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    ops_host_runtime::platform::reveal_in_file_manager(path)
}

// =============================================================================
// Chat CRUD
// =============================================================================

#[tauri::command]
pub fn create_chat(
    title: String,
    image_hash: String,
    ocr_lang: Option<String>,
) -> Result<ChatMetadata, String> {
    let storage = get_active_storage()?;
    let mut metadata = ChatMetadata::new(title, image_hash.clone(), ocr_lang);
    metadata.image_tone = storage.get_image_tone(&image_hash);
    let chat = ChatData::new(metadata.clone());
    storage.save_chat(&chat).map_err(|e| e.to_string())?;
    Ok(metadata)
}

#[tauri::command]
pub fn load_chat(chat_id: String) -> Result<ChatData, String> {
    let storage = get_active_storage()?;
    storage.load_chat(&chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_chats() -> Result<Vec<ChatMetadata>, String> {
    let storage = get_active_storage()?;
    storage.list_chats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_chats(query: String, limit: Option<usize>) -> Result<Vec<ChatSearchResult>, String> {
    let storage = get_active_storage()?;
    let max_results = limit.unwrap_or(60).clamp(1, 200);
    search_local_chats(&storage, &query, max_results)
}

#[tauri::command]
pub fn delete_chat(chat_id: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage.delete_chat(&chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_chat_metadata(metadata: ChatMetadata) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .update_chat_metadata(&metadata)
        .map_err(|e| e.to_string())
}

// =============================================================================
// Messages
// =============================================================================

#[tauri::command]
pub fn append_chat_message(chat_id: String, role: String, content: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    let message = if role == "user" {
        ChatMessage::user(content)
    } else {
        ChatMessage::assistant(content)
    };
    storage
        .append_message(&chat_id, &message)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn overwrite_chat_messages(chat_id: String, messages: Vec<ChatMessage>) -> Result<(), String> {
    let storage = get_active_storage()?;
    let mut chat = storage.load_chat(&chat_id).map_err(|e| e.to_string())?;
    chat.messages = messages;
    storage.save_chat(&chat).map_err(|e| e.to_string())
}

// =============================================================================
// OCR Storage
// =============================================================================

#[tauri::command]
pub fn save_ocr_data(
    chat_id: String,
    model_id: String,
    ocr_data: Vec<OcrRegion>,
) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .save_ocr_data(&chat_id, &model_id, &ocr_data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ocr_data(chat_id: String, model_id: String) -> Result<Option<Vec<OcrRegion>>, String> {
    let storage = get_active_storage()?;
    storage
        .get_ocr_data(&chat_id, &model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ocr_frame(chat_id: String) -> Result<OcrFrame, String> {
    let storage = get_active_storage()?;
    storage.get_ocr_frame(&chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn init_ocr_frame(chat_id: String, model_ids: Vec<String>) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .init_ocr_frame(&chat_id, &model_ids)
        .map_err(|e| e.to_string())
}

// =============================================================================
// ImgBB + Summaries + Tone + Brief
// =============================================================================

#[tauri::command]
pub fn save_imgbb_url(chat_id: String, url: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .save_imgbb_url(&chat_id, &url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_imgbb_url(chat_id: String) -> Result<Option<String>, String> {
    let storage = get_active_storage()?;
    storage.get_imgbb_url(&chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_rolling_summary(chat_id: String, summary: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .save_rolling_summary(&chat_id, &summary)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_image_tone(chat_id: String, tone: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .save_image_tone(&chat_id, &tone)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_image_brief(chat_id: String, brief: String) -> Result<(), String> {
    let storage = get_active_storage()?;
    storage
        .save_image_brief(&chat_id, &brief)
        .map_err(|e| e.to_string())
}
