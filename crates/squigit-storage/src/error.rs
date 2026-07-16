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

    /// Empty image provided.
    #[error("Empty image data")]
    EmptyImage,

    /// Invalid hash format.
    #[error("Invalid hash format")]
    InvalidHash,

    /// Image not found.
    #[error("Image not found: {0}")]
    ImageNotFound(String),

    /// Thread not found.
    #[error("Thread not found: {0}")]
    ThreadNotFound(String),

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

    /// Unsupported OCR annotations key.
    #[error("Unsupported OCR model id: {0}")]
    InvalidOcrModel(String),
}

/// Result type alias for storage operations.
pub type Result<T> = std::result::Result<T, StorageError>;
