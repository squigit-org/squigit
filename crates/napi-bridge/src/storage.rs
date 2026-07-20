// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use serde::{de::DeserializeOwned, Serialize};
use squigit_storage::{ThreadMessage, ThreadStorage};

use crate::types::NapiStoredImage;

fn map_storage_err(err: squigit_storage::StorageError) -> Error {
    Error::from_reason(err.to_string())
}

fn active_storage() -> Result<ThreadStorage> {
    ThreadStorage::new().map_err(map_storage_err)
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

#[napi(js_name = "store_image_from_path")]
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

#[napi(js_name = "store_file_from_path")]
pub fn store_file_from_path(path: String) -> Result<NapiStoredImage> {
    let storage = active_storage()?;
    let stored = storage
        .store_file_from_path(&path, None)
        .map_err(map_storage_err)?;
    Ok(stored.into())
}

#[napi(js_name = "register_attachment_source")]
pub fn register_attachment_source(
    thread_id: String,
    cas_path: String,
    source_path: String,
    display_name: Option<String>,
) -> Result<()> {
    active_storage()?
        .register_attachment_source(&thread_id, &cas_path, &source_path, display_name.as_deref())
        .map_err(map_storage_err)
}

#[napi(js_name = "resolve_attachment_source_path")]
pub fn resolve_attachment_source_path(
    cas_path: String,
    thread_id: Option<String>,
) -> Result<Option<String>> {
    let source_path = active_storage()?
        .get_attachment_source_path(&cas_path, thread_id.as_deref())
        .map_err(map_storage_err)?;

    Ok(source_path.filter(|path| std::path::Path::new(path).is_file()))
}

#[napi(js_name = "list_attachment_sources")]
pub fn list_attachment_sources(thread_id: Option<String>) -> Result<String> {
    let sources = active_storage()?
        .list_attachment_sources(thread_id.as_deref())
        .map_err(map_storage_err)?;
    to_json(&sources)
}

#[napi(js_name = "get_image_path")]
pub fn get_image_path(hash: String) -> Result<String> {
    let storage = active_storage()?;
    storage.get_image_path(&hash).map_err(map_storage_err)
}

#[napi(js_name = "create_thread")]
pub fn create_thread(
    title: String,
    image_hash: String,
    workspace_id: Option<String>,
) -> Result<String> {
    let storage = active_storage()?;
    let metadata = squigit_storage::ThreadMetadata::new(title, image_hash);
    let thread = squigit_storage::ThreadData::new(metadata.clone());
    if let Some(workspace_id) = workspace_id {
        storage
            .save_thread_in_workspace(&thread, &workspace_id)
            .map_err(map_storage_err)?;
    } else {
        storage.save_thread(&thread).map_err(map_storage_err)?;
    }
    to_json(&metadata)
}

#[napi(js_name = "create_workspace")]
pub fn create_workspace(path: String) -> Result<String> {
    let storage = active_storage()?;
    let workspace = storage.create_workspace(&path).map_err(map_storage_err)?;
    to_json(&workspace)
}

#[napi(js_name = "list_workspaces")]
pub fn list_workspaces() -> Result<String> {
    let storage = active_storage()?;
    let workspaces = storage.list_workspaces().map_err(map_storage_err)?;
    to_json(&workspaces)
}

#[napi(js_name = "set_thread_workspace")]
pub fn set_thread_workspace(thread_id: String, workspace_id: String) -> Result<()> {
    let storage = active_storage()?;
    storage
        .set_thread_workspace(&thread_id, &workspace_id)
        .map_err(map_storage_err)
}

#[napi(js_name = "list_threads")]
pub fn list_threads() -> Result<String> {
    let storage = active_storage()?;
    let threads = storage.list_threads().map_err(map_storage_err)?;
    to_json(&threads)
}

#[napi(js_name = "load_thread")]
pub fn load_thread(thread_id: String) -> Result<String> {
    let storage = active_storage()?;
    let thread = storage.load_thread(&thread_id).map_err(map_storage_err)?;
    to_json(&thread)
}

#[napi(js_name = "fork_thread")]
pub fn fork_thread(thread_id: String, message_index: u32) -> Result<String> {
    let storage = active_storage()?;
    let metadata = storage
        .fork_thread(&thread_id, message_index as usize)
        .map_err(map_storage_err)?;
    to_json(&metadata)
}

#[napi(js_name = "delete_thread")]
pub fn delete_thread(thread_id: String) -> Result<()> {
    let storage = active_storage()?;
    storage.delete_thread(&thread_id).map_err(map_storage_err)
}

#[napi(js_name = "update_thread_metadata")]
pub fn update_thread_metadata(metadata_json: String) -> Result<()> {
    let storage = active_storage()?;
    let metadata = from_json::<squigit_storage::ThreadMetadata>(&metadata_json)?;
    storage
        .update_thread_metadata(&metadata)
        .map_err(map_storage_err)
}

#[napi(js_name = "append_thread_message")]
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

#[napi(js_name = "save_reverse_image_search_cache")]
pub fn save_reverse_image_search_cache(
    thread_id: String,
    imgbb_url: String,
    google_lens_url: String,
) -> Result<()> {
    let storage = active_storage()?;
    storage
        .save_reverse_image_search_cache(&thread_id, &imgbb_url, &google_lens_url)
        .map_err(map_storage_err)
}

#[napi(js_name = "get_reverse_image_search_cache")]
pub fn get_reverse_image_search_cache(thread_id: String) -> Result<String> {
    let storage = active_storage()?;
    let cache = storage
        .get_reverse_image_search_cache(&thread_id)
        .map_err(map_storage_err)?;
    to_json(&cache)
}

#[napi(js_name = "save_image_tone")]
pub fn save_image_tone(thread_id: String, tone: String) -> Result<()> {
    let storage = active_storage()?;
    storage
        .save_image_tone(&thread_id, &tone)
        .map_err(map_storage_err)
}
