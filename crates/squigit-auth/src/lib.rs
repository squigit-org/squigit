// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub mod auth;
pub mod error;
pub mod security;
pub mod store;
pub mod types;

pub use auth::{
    AuthAccountPolicy, AuthFlowSettings, AuthSuccessData, BrowserOpener, CredentialsSource,
};
pub use error::{ProfileError, Result};
pub use security::{validate_api_key, verify_artifact_signature, ApiKeyProvider};
pub use store::ProfileStore;
pub use types::{Profile, ProfileAuth, ProfileSnapshot};
