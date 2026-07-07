// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use serde::{de::DeserializeOwned, Serialize};
use squigit_auth::ProfileStore;
use squigit_memory::{ThreadMessage, ThreadStorage};

use crate::types::{NapiThreadData, NapiThreadMetadata, NapiStoredImage};

fn map_storage_err(err: squigit_memory::StorageError) -> Error {
    Error::from_reason(err.to_string())
}

fn map_profile_err(err: squigit_auth::error::ProfileError) -> Error {
    Error::from_reason(err.to_string())
}

fn active_storage() -> Result<ThreadStorage> {
    let profile_store = ProfileStore::new().map_err(map_profile_err)?;
    let active_id = profile_store
        .get_active_profile_id()
        .map_err(map_profile_err)?
        .ok_or_else(|| Error::from_reason("No active profile. Please log in first."))?;
    let threads_dir = profile_store.get_threads_dir(&active_id);
    ThreadStorage::with_base_dir(threads_dir).map_err(map_storage_err)
}

fn map_json_err(err: serde_json::Error) -> Error {
    Error::from_reason(err.to_string())
}

fn to_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).map_err(map_json_err)
}

fn from_json<T: DeserializeOwned>(value: &str) -> Result<T> {
    serde_json::from_str(value).map_err(map_json_err)
}

#[napi]
pub fn store_image_from_path(path: String) -> Result<NapiStoredImage> {
    #[cfg(feature = "desktop")]
    {
        desktop_runtime::media::process_and_store_image(path)
            .map(Into::into)
            .map_err(Error::from_reason)
    }

    #[cfg(not(feature = "desktop"))]
    {
        let storage = active_storage()?;
        let buffer = std::fs::read(&path).map_err(|e| Error::from_reason(e.to_string()))?;
        let image = storage
            .store_image(&buffer, None)
            .map_err(map_storage_err)?;
        Ok(image.into())
    }
}

#[napi]
pub fn store_file_from_path(path: String) -> Result<NapiStoredImage> {
    let storage = active_storage()?;
    let stored = storage
        .store_file_from_path(&path, None)
        .map_err(map_storage_err)?;
    Ok(stored.into())
}

#[napi]
pub fn get_image_path(hash: String) -> Result<String> {
    let storage = active_storage()?;
    storage.get_image_path(&hash).map_err(map_storage_err)
}

#[napi]
pub fn create_thread(
    title: String,
    image_hash: String,
    ocr_lang: Option<String>,
) -> Result<NapiThreadMetadata> {
    let storage = active_storage()?;
    let mut metadata = squigit_memory::ThreadMetadata::new(title, image_hash.clone(), ocr_lang);
    metadata.image_tone = storage.get_image_tone(&image_hash);
    let thread = squigit_memory::ThreadData::new(metadata.clone());
    storage.save_thread(&thread).map_err(map_storage_err)?;
    Ok(metadata.into())
}

#[napi]
pub fn create_thread_json(
    title: String,
    image_hash: String,
    ocr_lang: Option<String>,
) -> Result<String> {
    let storage = active_storage()?;
    let mut metadata = squigit_memory::ThreadMetadata::new(title, image_hash.clone(), ocr_lang);
    metadata.image_tone = storage.get_image_tone(&image_hash);
    let thread = squigit_memory::ThreadData::new(metadata.clone());
    storage.save_thread(&thread).map_err(map_storage_err)?;
    to_json(&metadata)
}

#[napi]
pub fn list_threads() -> Result<Vec<NapiThreadMetadata>> {
    let storage = active_storage()?;
    let threads = storage.list_threads().map_err(map_storage_err)?;
    Ok(threads.into_iter().map(Into::into).collect())
}

#[napi]
pub fn list_threads_json() -> Result<String> {
    let storage = active_storage()?;
    let threads = storage.list_threads().map_err(map_storage_err)?;
    to_json(&threads)
}

#[napi]
pub fn load_thread(thread_id: String) -> Result<NapiThreadData> {
    let storage = active_storage()?;
    let thread = storage.load_thread(&thread_id).map_err(map_storage_err)?;
    Ok(thread.into())
}

#[napi]
pub fn load_thread_json(thread_id: String) -> Result<String> {
    let storage = active_storage()?;
    let thread = storage.load_thread(&thread_id).map_err(map_storage_err)?;
    to_json(&thread)
}

#[napi]
pub fn delete_thread(thread_id: String) -> Result<()> {
    let storage = active_storage()?;
    storage.delete_thread(&thread_id).map_err(map_storage_err)
}

#[napi]
pub fn update_thread_metadata(metadata: NapiThreadMetadata) -> Result<()> {
    let storage = active_storage()?;

    // Merge with the on-disk metadata because the N-API shape omits some fields.
    let mut current = storage
        .load_thread(&metadata.id)
        .map_err(map_storage_err)?
        .metadata;
    current.title = metadata.title;
    current.is_pinned = metadata.is_pinned;
    current.ocr_lang = metadata.ocr_lang;
    current.image_tone = metadata.image_tone;
    current.reverse_image_search_url = metadata.reverse_image_search_url;

    storage
        .update_thread_metadata(&current)
        .map_err(map_storage_err)
}

#[napi]
pub fn update_thread_metadata_json(metadata_json: String) -> Result<()> {
    let storage = active_storage()?;
    let metadata = from_json::<squigit_memory::ThreadMetadata>(&metadata_json)?;
    storage
        .update_thread_metadata(&metadata)
        .map_err(map_storage_err)
}

#[napi]
pub fn append_thread_message(thread_id: String, role: String, content: String) -> Result<()> {
    let storage = active_storage()?;
    let msg = if role == "assistant" {
        ThreadMessage::assistant(content)
    } else {
        ThreadMessage::user(content)
    };
    storage
        .append_message(&thread_id, &msg)
        .map_err(map_storage_err)
}

#[napi]
pub fn save_rolling_summary(thread_id: String, summary: String) -> Result<()> {
    let storage = active_storage()?;
    storage
        .save_rolling_summary(&thread_id, &summary)
        .map_err(map_storage_err)
}

#[napi]
pub fn get_rolling_summary(thread_id: String) -> Result<Option<String>> {
    let storage = active_storage()?;
    let thread = storage.load_thread(&thread_id).map_err(map_storage_err)?;
    Ok(thread.rolling_summary)
}

#[napi]
pub fn save_reverse_image_search_url(thread_id: String, url: String) -> Result<()> {
    let storage = active_storage()?;
    storage
        .save_reverse_image_search_url(&thread_id, &url)
        .map_err(map_storage_err)
}

#[napi]
pub fn get_reverse_image_search_url(thread_id: String) -> Result<Option<String>> {
    let storage = active_storage()?;
    storage
        .get_reverse_image_search_url(&thread_id)
        .map_err(map_storage_err)
}

#[napi]
pub fn save_image_tone(thread_id: String, tone: String) -> Result<()> {
    let storage = active_storage()?;
    storage
        .save_image_tone(&thread_id, &tone)
        .map_err(map_storage_err)
}
