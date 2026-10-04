// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Profile, auth-state, and encrypted-key root storage.

mod auth;
mod store;
mod types;

pub use store::{KeyStoreTransaction, ProfileStore};
pub use types::{
    canonical_google_issuer, EncryptedKeyRecord, LastLogin, Profile, ProfileIdentity,
    ProfileSnapshot, RecordCipher, RecordKdf, GOOGLE_ISSUER, GOOGLE_PROFILE_ID_PREFIX,
    GOOGLE_PROVIDER,
};
