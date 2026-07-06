// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content Addressable Storage (CAS) for images and thread data.
//!
//! This crate provides a Git-like storage system for the Squigit application,
//! storing images by their BLAKE3 hash (deduplication) and managing thread data
//! with persistent storage.
//!
//! # Example
//!
//! ```no_run
//! use squigit_memory::{ThreadStorage, ThreadMetadata, ThreadData};
//!
//! let storage = ThreadStorage::with_base_dir(std::env::temp_dir().join("squigit-doc-example")).unwrap();
//!
//! // Store an image
//! let image_bytes = std::fs::read("screenshot.png").unwrap();
//! let stored = storage.store_image(&image_bytes, None).unwrap();
//! println!("Image hash: {}", stored.hash);
//! println!("Image path: {}", stored.path);
//!
//! // Create a thread
//! let metadata = ThreadMetadata::new("My Analysis".to_string(), stored.hash, None);
//! let thread = ThreadData::new(metadata);
//! storage.save_thread(&thread).unwrap();
//! ```

pub mod error;
pub mod identity;
pub mod paths;
pub mod storage;
pub mod types;

pub use error::{Result, StorageError};
pub use storage::ThreadStorage;
pub use types::{
    AttachmentRegistry, ThreadAttachmentKind, ThreadAttachmentProviderFile, ThreadAttachmentRecord,
    ThreadData, ThreadMessage, ThreadMetadata, OcrFrame, OcrRegion, StoredImage,
};
