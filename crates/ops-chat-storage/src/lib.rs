// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Content Addressable Storage (CAS) for images and chat data.
//!
//! This crate provides a Git-like storage system for the Spatialshot application,
//! storing images by their BLAKE3 hash (deduplication) and managing chat data
//! with persistent storage.
//!
//! # Example
//!
//! ```no_run
//! use ops_chat_storage::{ChatStorage, ChatMetadata, ChatData};
//!
//! let storage = ChatStorage::new().unwrap();
//!
//! // Store an image
//! let image_bytes = std::fs::read("screenshot.png").unwrap();
//! let stored = storage.store_image(&image_bytes).unwrap();
//! println!("Image hash: {}", stored.hash);
//! println!("Image path: {}", stored.path);
//!
//! // Create a chat
//! let metadata = ChatMetadata::new("My Analysis".to_string(), stored.hash);
//! let chat = ChatData::new(metadata);
//! storage.save_chat(&chat).unwrap();
//! ```

pub mod error;
pub mod storage;
pub mod types;

pub use error::{Result, StorageError};
pub use storage::ChatStorage;
pub use types::{ChatData, ChatMessage, ChatMetadata, OcrRegion, StoredImage};
