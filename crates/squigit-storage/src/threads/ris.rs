// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;

use crate::error::{Result, StorageError};

use super::paths::reverse_image_search_path;
use super::{ReverseImageSearchCache, ThreadStorage};

impl ThreadStorage {
    /// Save the reverse image search cache for a thread.
    pub fn save_reverse_image_search_cache(
        &self,
        thread_id: &str,
        imgbb_url: &str,
        google_lens_url: &str,
    ) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        if !thread_dir.exists() {
            return Err(StorageError::ThreadNotFound(thread_id.to_string()));
        }

        let cache = ReverseImageSearchCache {
            imgbb_url: Some(imgbb_url.to_string()),
            google_lens_url: Some(google_lens_url.to_string()),
            created_at: Some(chrono::Utc::now()),
        };
        fs::write(
            reverse_image_search_path(&thread_dir),
            serde_json::to_string_pretty(&cache)?,
        )?;

        Ok(())
    }

    /// Get the reverse image search cache for a thread.
    pub fn get_reverse_image_search_cache(
        &self,
        thread_id: &str,
    ) -> Result<Option<ReverseImageSearchCache>> {
        let thread_dir = self.thread_dir(thread_id);
        let path = reverse_image_search_path(&thread_dir);
        if !path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(path)?;
        Ok(Some(serde_json::from_str::<ReverseImageSearchCache>(
            &json,
        )?))
    }
}
