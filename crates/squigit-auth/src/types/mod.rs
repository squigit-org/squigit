// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Type definitions for profile storage.

mod profile;

pub use profile::{
    canonical_google_issuer, LastLogin, Profile, ProfileAuth, ProfileIdentity, ProfileSnapshot,
    AUTH_MODE_GOOGLE_OIDC_PKCE, AUTH_SCHEMA_VERSION, GOOGLE_ISSUER, GOOGLE_PROVIDER,
};
