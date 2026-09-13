// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Storage access shared by every Squigit shell-facing service.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub use squigit_storage::*;

pub(crate) fn profile_store() -> Result<ProfileStore> {
    ProfileStore::new()
}

pub(crate) fn thread_store() -> Result<ThreadStorage> {
    ThreadStorage::new()
}

pub(crate) fn version_store() -> Result<VersionStore> {
    VersionStore::new()
}

pub(crate) fn config_path(file_name: &str) -> Option<PathBuf> {
    paths::base_config_dir().map(|directory| directory.join(file_name))
}

pub fn rules_path() -> Option<PathBuf> {
    rules::rules_path()
}

pub fn load_rules() -> std::result::Result<String, String> {
    let path =
        rules_path().ok_or_else(|| "Could not locate Squigit's RULES.md path".to_string())?;
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_rules(content: &str) -> std::result::Result<(), String> {
    if rules_path().is_none() {
        return Err("Could not locate Squigit's RULES.md path".to_string());
    }
    rules::save_rules(content)
}

/// Store image bytes in Squigit's content-addressable storage.
pub fn store_image(bytes: &[u8], explicit_tone: Option<String>) -> Result<StoredImage> {
    thread_store()?.store_image(bytes, explicit_tone)
}

/// Store arbitrary bytes in Squigit's content-addressable storage.
pub fn store_file(
    bytes: &[u8],
    extension: &str,
    explicit_tone: Option<String>,
) -> Result<StoredImage> {
    thread_store()?.store_file(bytes, extension, explicit_tone)
}

#[derive(Clone, Debug)]
pub struct GalleryThread {
    pub thread_id: String,
    pub title: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct GalleryImage {
    pub hash: String,
    pub path: String,
    pub updated_at: String,
    pub threads: Vec<GalleryThread>,
}

/// Return stored thread images grouped for gallery presentation.
pub fn list_gallery(offset: u32, limit: u32) -> Result<Vec<GalleryImage>> {
    let storage = thread_store()?;
    let mut grouped: HashMap<String, Vec<GalleryThread>> = HashMap::new();

    for thread in storage.list_threads()? {
        if thread.image_hash.is_empty() || thread.image_hash == EMPTY_STATE_ASSET_ID {
            continue;
        }
        grouped
            .entry(thread.image_hash)
            .or_default()
            .push(GalleryThread {
                thread_id: thread.id,
                title: thread.title,
                updated_at: thread.updated_at.to_rfc3339(),
            });
    }

    let mut images = grouped
        .into_iter()
        .filter_map(|(hash, mut threads)| {
            threads.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
            let updated_at = threads.first()?.updated_at.clone();
            let path = storage.get_image_path(&hash).ok()?;
            Some(GalleryImage {
                hash,
                path,
                updated_at,
                threads,
            })
        })
        .collect::<Vec<_>>();
    images.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(images
        .into_iter()
        .skip(offset as usize)
        .take((limit as usize).clamp(1, 100))
        .collect())
}
