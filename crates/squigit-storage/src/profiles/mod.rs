// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Profile, auth-state, and encrypted-key root storage.

mod atomic;
mod store;
mod types;

pub use store::{KeyStoreTransaction, ProfileStore};
pub use types::{
    canonical_google_issuer, EncryptedKeyRecord, KeyFile, LastLogin, Profile, ProfileAuth,
    ProfileIdentity, ProfileKeyRecords, ProfileSnapshot, RecordCipher, RecordKdf,
    AUTH_MODE_GOOGLE_OIDC_PKCE, AUTH_SCHEMA_VERSION, GOOGLE_ISSUER, GOOGLE_PROFILE_ID_PREFIX,
    GOOGLE_PROVIDER, KEY_FILE_SCHEMA_VERSION,
};
