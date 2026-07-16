// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::BTreeMap;
use std::fs;

use crate::error::{Result, StorageError};

use super::{ThreadMetadata, ThreadStorage};

type ThreadIndex = BTreeMap<String, ThreadMetadata>;

impl ThreadStorage {
    pub(super) fn read_index(&self) -> Result<ThreadIndex> {
        if !self.index_path.exists() {
            return Ok(ThreadIndex::new());
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        Ok(serde_json::from_str::<ThreadIndex>(&index_json)?)
    }

    pub(super) fn write_index(&self, index: &ThreadIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)?;
        fs::write(&self.index_path, json)?;
        Ok(())
    }

    pub(super) fn get_index_metadata(&self, thread_id: &str) -> Result<ThreadMetadata> {
        let mut index = self.read_index()?;
        index
            .remove(thread_id)
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub(super) fn update_index(&self, metadata: &ThreadMetadata) -> Result<()> {
        let mut index = self.read_index()?;
        index.insert(metadata.id.clone(), metadata.clone());
        self.write_index(&index)
    }

    pub(super) fn remove_from_index(&self, thread_id: &str) -> Result<()> {
        let mut index = self.read_index()?;
        index.remove(thread_id);
        self.write_index(&index)
    }
}
