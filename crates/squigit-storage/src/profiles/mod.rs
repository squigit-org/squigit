// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Profile, auth-state, and encrypted-key root storage.

mod atomic;
mod store;
mod types;

pub use store::ProfileStore;
pub use types::{
    AUTH_MODE_GOOGLE_OIDC_PKCE, AUTH_SCHEMA_VERSION, GOOGLE_ISSUER, GOOGLE_PROVIDER, LastLogin,
    Profile, ProfileAuth, ProfileIdentity, ProfileSnapshot, canonical_google_issuer,
};
