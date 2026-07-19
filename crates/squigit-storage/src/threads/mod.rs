// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Thread storage manager and thread-local persisted state.

use std::fs;
use std::path::PathBuf;

use crate::error::{Result, StorageError};

mod index;
mod lifecycle;
mod ocr;
mod paths;
mod ris;
pub mod types;

#[cfg(test)]
mod tests;

pub use types::{
    default_ocr_annotations, AttachmentRegistry, ContextWindow, OcrAnnotationEntry, OcrAnnotations,
    OcrModelAnnotation, OcrRegion, ProjectMetadata, ReverseImageSearchCache, ThreadAttachmentKind,
    ThreadAttachmentProviderFile, ThreadAttachmentRecord, ThreadData, ThreadMessage,
    ThreadMetadata, EMPTY_STATE_ASSET_ID,
};

/// Main storage manager for threads and content-addressed objects.
pub struct ThreadStorage {
    /// Base directory for all thread storage.
    pub(crate) base_dir: PathBuf,
    /// Directory for content-addressed objects.
    pub(crate) objects_dir: PathBuf,
    /// Path to the thread index file.
    pub(crate) index_path: PathBuf,
}

impl ThreadStorage {
    /// Create a new storage manager with a custom thread base directory.
    ///
    /// This is the primary constructor for thread storage.
    /// Use this with the global threads directory.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use squigit_storage::ThreadStorage;
    /// use std::path::PathBuf;
    ///
    /// let threads_dir = PathBuf::from("/path/to/squigit/threads");
    /// let storage = ThreadStorage::with_base_dir(threads_dir).unwrap();
    /// ```
    pub fn with_base_dir(base_dir: PathBuf) -> Result<Self> {
        let objects_dir = crate::paths::base_config_dir()
            .ok_or(StorageError::NoDataDir)?
            .join("objects");
        let index_path = base_dir.join("index.json");

        fs::create_dir_all(&base_dir)?;
        fs::create_dir_all(&objects_dir)?;

        Ok(Self {
            base_dir,
            objects_dir,
            index_path,
        })
    }

    /// Create a new storage manager using the default global thread location.
    pub fn new() -> Result<Self> {
        let base_dir = crate::paths::base_config_dir()
            .ok_or(StorageError::NoDataDir)?
            .join("threads");

        Self::with_base_dir(base_dir)
    }

    /// Get the base storage directory path.
    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    /// Get the objects directory path.
    pub fn objects_dir(&self) -> &PathBuf {
        &self.objects_dir
    }

    pub(super) fn thread_dir(&self, thread_id: &str) -> PathBuf {
        self.base_dir.join(thread_id)
    }
}
