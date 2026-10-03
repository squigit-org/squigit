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
//! let storage = ThreadStorage::new().unwrap();
//!
//! // Store an image
//! let image_bytes = std::fs::read("screenshot.png").unwrap();
//! let stored = storage.store_image(&image_bytes, None).unwrap();
//! let original = storage.store_image_blob(&image_bytes, "png").unwrap();
//! println!("Image hash: {}", stored.hash);
//! println!("Image path: {}", stored.path);
//!
//! // Create a thread
//! let original_hash = blake3::hash(&image_bytes).to_hex().to_string();
//! let metadata = ThreadMetadata::new("My Analysis".to_string(), stored.hash, original_hash, original.name);
//! let initial = storage.attachment_manifest_entry(&metadata.image_hash, "squigitshot.png", chrono::Utc::now()).unwrap();
//! let thread = ThreadData::new(metadata, initial);
//! storage.save_thread(&thread).unwrap();
//! ```

pub mod blob_storage;
pub mod cas;
pub mod error;
pub mod paths;
pub mod profiles;
pub mod rules;
mod secure_file;
pub mod threads;
pub mod version;

pub use blob_storage::StoredBlob;
pub use cas::{
    AttachmentFileType, DocumentConversion, ImageRendition, ObjectFileContext, ObjectManifest,
    ObjectManifestLock, ReverseImageSearchCache, StoredImage, OBJECT_MANIFEST_SCHEMA_VERSION,
};
pub use error::{Result, StorageError};
pub use profiles::{
    canonical_google_issuer, EncryptedKeyRecord, KeyFile, KeyStoreTransaction, LastLogin, Profile,
    ProfileAuth, ProfileIdentity, ProfileKeyRecords, ProfileSnapshot, ProfileStore, RecordCipher,
    RecordKdf, AUTH_MODE_GOOGLE_OIDC_PKCE, AUTH_SCHEMA_VERSION, GOOGLE_ISSUER,
    GOOGLE_PROFILE_ID_PREFIX, GOOGLE_PROVIDER, KEY_FILE_SCHEMA_VERSION,
};
pub use threads::{
    AssistantError, AttachmentManifest, AttachmentManifestEntry, ContextWindow, Conversation,
    ForkSourceKind, ForkedFrom, GroundingImage, GroundingResource, GroundingTool, GroundingVideo,
    ManifestMention, MessageAttachment, MessageGrounding, MessageTextCitation, OcrAnnotationEntry,
    OcrAnnotations, OcrModelAnnotation, OcrRegion, SideChatData, SideChatMetadata, ThreadData,
    ThreadMessage, ThreadMetadata, ThreadStorage, WorkspaceMetadata, DEFAULT_SIDE_CHAT_TITLE,
    DEFAULT_THREAD_TITLE, EMPTY_STATE_ASSET_ID,
};
pub use version::{
    ProductVersion, VersionFile, VersionStore, VersionStoreGuard, VersionType, VERSION_FILE_NAME,
};
