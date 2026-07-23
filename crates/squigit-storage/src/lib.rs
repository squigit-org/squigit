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
//! use squigit_storage::{ThreadStorage, ThreadMetadata, ThreadData};
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
//! let metadata = ThreadMetadata::new("My Analysis".to_string(), stored.hash);
//! let initial = storage.attachment_manifest_entry(&metadata.image_hash, "squigitshot.png", chrono::Utc::now()).unwrap();
//! let thread = ThreadData::new(metadata, initial);
//! storage.save_thread(&thread).unwrap();
//! ```

pub mod cas;
pub mod error;
pub mod paths;
pub mod profiles;
pub mod rules;
pub mod threads;

pub use cas::{AttachmentFileType, ObjectFileContext, ObjectManifest, ObjectRemote, StoredImage};
pub use error::{Result, StorageError};
pub use profiles::{
    canonical_google_issuer, LastLogin, Profile, ProfileAuth, ProfileIdentity, ProfileSnapshot,
    ProfileStore, AUTH_MODE_GOOGLE_OIDC_PKCE, AUTH_SCHEMA_VERSION, GOOGLE_ISSUER, GOOGLE_PROVIDER,
};
pub use threads::{
    AttachmentManifest, AttachmentManifestEntry, ContextWindow, MessageAttachment,
    OcrAnnotationEntry, OcrAnnotations, OcrModelAnnotation, OcrRegion, ReverseImageSearchCache,
    ThreadData, ThreadMessage, ThreadMetadata, ThreadStorage, WorkspaceMetadata,
    EMPTY_STATE_ASSET_ID,
};
