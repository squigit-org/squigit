// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use squigit_memory::{ChatStorage, ChatMessage};
use squigit_auth::ProfileStore;

use crate::types::{NapiChatData, NapiChatMetadata, NapiStoredImage};

fn map_storage_err(err: squigit_memory::StorageError) -> Error {
    Error::from_reason(err.to_string())
}

fn map_profile_err(err: squigit_auth::error::ProfileError) -> Error {
    Error::from_reason(err.to_string())
}

fn active_storage() -> Result<ChatStorage> {
    let profile_store = ProfileStore::new().map_err(map_profile_err)?;
    let active_id = profile_store
        .get_active_profile_id()
        .map_err(map_profile_err)?
        .ok_or_else(|| Error::from_reason("No active profile. Please log in first."))?;
    let chats_dir = profile_store.get_chats_dir(&active_id);
    ChatStorage::with_base_dir(chats_dir).map_err(map_storage_err)
}

#[napi]
pub fn store_image_from_path(path: String) -> Result<NapiStoredImage> {
    let storage = active_storage()?;
    let buffer = std::fs::read(&path).map_err(|e| Error::from_reason(e.to_string()))?;
    let image = storage.store_image(&buffer, None).map_err(map_storage_err)?;
    Ok(image.into())
}

#[napi]
pub fn get_image_path(hash: String) -> Result<String> {
    let storage = active_storage()?;
    storage.get_image_path(&hash).map_err(map_storage_err)
}

#[napi]
pub fn create_chat(title: String, image_hash: String, ocr_lang: Option<String>) -> Result<NapiChatMetadata> {
    let storage = active_storage()?;
    let mut metadata = squigit_memory::ChatMetadata::new(title, image_hash.clone(), ocr_lang);
    metadata.image_tone = storage.get_image_tone(&image_hash);
    let chat = squigit_memory::ChatData::new(metadata.clone());
    storage.save_chat(&chat).map_err(map_storage_err)?;
    Ok(metadata.into())
}

#[napi]
pub fn list_chats() -> Result<Vec<NapiChatMetadata>> {
    let storage = active_storage()?;
    let chats = storage.list_chats().map_err(map_storage_err)?;
    Ok(chats.into_iter().map(Into::into).collect())
}

#[napi]
pub fn load_chat(chat_id: String) -> Result<NapiChatData> {
    let storage = active_storage()?;
    let chat = storage.load_chat(&chat_id).map_err(map_storage_err)?;
    Ok(chat.into())
}

#[napi]
pub fn delete_chat(chat_id: String) -> Result<()> {
    let storage = active_storage()?;
    storage.delete_chat(&chat_id).map_err(map_storage_err)
}

#[napi]
pub fn update_chat_metadata(metadata: NapiChatMetadata) -> Result<()> {
    let storage = active_storage()?;
    
    // We need to fetch the existing one to merge because NapiChatMetadata doesn't have all fields 
    // Wait, NapiChatMetadata has all fields. Let's convert back.
    let mut current = storage.load_chat(&metadata.id).map_err(map_storage_err)?.metadata;
    current.title = metadata.title;
    current.is_pinned = metadata.is_pinned;
    current.is_starred = metadata.is_starred;
    
    storage.update_chat_metadata(&current).map_err(map_storage_err)
}

#[napi]
pub fn append_chat_message(chat_id: String, role: String, content: String) -> Result<()> {
    let storage = active_storage()?;
    let msg = if role == "assistant" {
        ChatMessage::assistant(content)
    } else {
        ChatMessage::user(content)
    };
    storage.append_message(&chat_id, &msg).map_err(map_storage_err)
}

#[napi]
pub fn save_rolling_summary(chat_id: String, summary: String) -> Result<()> {
    let storage = active_storage()?;
    storage.save_rolling_summary(&chat_id, &summary).map_err(map_storage_err)
}

#[napi]
pub fn get_rolling_summary(chat_id: String) -> Result<Option<String>> {
    let storage = active_storage()?;
    let chat = storage.load_chat(&chat_id).map_err(map_storage_err)?;
    Ok(chat.rolling_summary)
}

#[napi]
pub fn save_imgbb_url(chat_id: String, url: String) -> Result<()> {
    let storage = active_storage()?;
    storage.save_imgbb_url(&chat_id, &url).map_err(map_storage_err)
}

#[napi]
pub fn get_imgbb_url(chat_id: String) -> Result<Option<String>> {
    let storage = active_storage()?;
    let chat = storage.load_chat(&chat_id).map_err(map_storage_err)?;
    Ok(chat.imgbb_url)
}
