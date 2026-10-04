// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Error types for persisted storage.

use thiserror::Error;

/// Storage error types.
#[derive(Error, Debug)]
pub enum StorageError {
    /// No data directory found.
    #[error("Could not find data directory")]
    NoDataDir,

    /// Failed to locate the user's config directory.
    #[error("Could not locate config directory")]
    NoConfigDir,

    /// IO error.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Unsupported app.db schema version: {0}")]
    DatabaseSchema(u32),

    #[error("{0}")]
    InvalidHistory(String),

    /// CAS stores local images and supported documents.
    #[error("Unsupported attachment type: {0}. Images, documents, video, and audio are stored locally; text files are cited by path.")]
    UnsupportedAttachment(String),

    /// Empty image provided.
    #[error("Empty image data")]
    EmptyImage,

    /// Invalid hash format.
    #[error("Invalid hash format")]
    InvalidHash,

    /// A persisted Office-to-PDF conversion receipt is invalid.
    #[error("Invalid document conversion: {0}")]
    InvalidDocumentConversion(String),

    /// A persisted image rendition receipt is invalid.
    #[error("Invalid image rendition: {0}")]
    InvalidImageRendition(String),

    /// Image not found.
    #[error("Image not found: {0}")]
    ImageNotFound(String),

    /// Thread not found.
    #[error("Thread not found: {0}")]
    ThreadNotFound(String),

    /// Workspace not found.
    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),

    /// Workspace names must contain at least one non-whitespace character.
    #[error("Invalid workspace name")]
    InvalidWorkspaceName,

    /// Workspace path is invalid or too broad to use as an AI sandbox.
    #[error("Invalid workspace path: {0}")]
    InvalidWorkspacePath(String),

    /// Persisted message IDs must use the `msg-<UUID>` contract.
    #[error("Invalid thread message: {0}")]
    InvalidThreadMessage(String),

    /// Blobs must be UUID-named files inside their `blob_storage` category.
    #[error("Invalid blob: {0}")]
    InvalidBlob(String),

    /// Profile with the given ID was not found.
    #[error("Profile not found: {0}")]
    ProfileNotFound(String),

    /// Cannot delete the last remaining profile.
    #[error("Cannot delete the last profile")]
    CannotDeleteLastProfile,

    /// Profile ID is invalid.
    #[error("Invalid profile ID: {0}")]
    InvalidProfileId(String),

    /// Stored auth state is unsupported or invalid.
    #[error("{0}")]
    AuthState(String),

    /// Encrypted key-store structure, locking, or target safety failure.
    #[error("{0}")]
    KeyStore(String),

    /// Unsupported OCR annotations key.
    #[error("Unsupported OCR model id: {0}")]
    InvalidOcrModel(String),
}

/// Result type alias for storage operations.
pub type Result<T> = std::result::Result<T, StorageError>;
