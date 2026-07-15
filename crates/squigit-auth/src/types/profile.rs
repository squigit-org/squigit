// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const AUTH_SCHEMA_VERSION: u32 = 2;
pub const AUTH_MODE_GOOGLE_OIDC_PKCE: &str = "google_oidc_pkce";
pub const GOOGLE_PROVIDER: &str = "google";
pub const GOOGLE_ISSUER: &str = "https://accounts.google.com";

/// Stable federated identity metadata for a local profile.
///
/// Email, name, and avatar are mutable display attributes; identity is not.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileIdentity {
    pub provider: String,
    pub issuer: String,
    pub subject: String,
}

impl ProfileIdentity {
    pub fn google(issuer: &str, subject: &str) -> Self {
        Self {
            provider: GOOGLE_PROVIDER.to_string(),
            issuer: canonical_google_issuer(issuer).to_string(),
            subject: subject.to_string(),
        }
    }
}

/// Profile metadata stored in profiles.json.
///
/// Each profile represents a Google-authenticated user account,
/// containing identity information and serving as a container
/// for threads and BYOK keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    /// Filesystem-safe stable ID derived from provider issuer and subject.
    pub id: String,

    /// Immutable provider identity. This is the actual account key.
    pub identity: ProfileIdentity,

    /// Display name from Google account.
    pub name: String,

    /// Email address from Google account.
    pub email: String,

    /// Base64 PNG data URL for the cached avatar image.
    #[serde(default)]
    pub avatar_base64: Option<String>,

    /// Original Google avatar URL for online fallback and refresh.
    #[serde(default)]
    pub avatar_url: Option<String>,

    /// When the profile was first created.
    pub created_at: DateTime<Utc>,

    /// Last time this profile was used/logged into.
    pub last_used_at: DateTime<Utc>,
}

impl Profile {
    /// Create a new profile from a validated Google OIDC identity.
    pub fn new_google(
        issuer: &str,
        subject: &str,
        email: &str,
        name: &str,
        avatar_base64: Option<String>,
        avatar_url: Option<String>,
    ) -> Self {
        let now = Utc::now();
        let identity = ProfileIdentity::google(issuer, subject);
        Self {
            id: Self::id_from_identity(&identity),
            identity,
            name: name.to_string(),
            email: email.to_string(),
            avatar_base64,
            avatar_url,
            created_at: now,
            last_used_at: now,
        }
    }

    /// Generate a deterministic filesystem-safe profile ID from provider identity.
    pub fn id_from_identity(identity: &ProfileIdentity) -> String {
        let issuer = canonical_google_issuer(&identity.issuer);
        let mut input = Vec::with_capacity(issuer.len() + identity.subject.len() + 1);
        input.extend_from_slice(issuer.as_bytes());
        input.push(0);
        input.extend_from_slice(identity.subject.as_bytes());
        let hash = blake3::hash(&input);
        format!("{}_{}", identity.provider, &hash.to_hex()[..32])
    }

    /// Update the last_used_at timestamp to now.
    pub fn touch(&mut self) {
        self.last_used_at = Utc::now();
    }
}

/// Authentication state stored in auth.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileAuth {
    pub schema: u32,

    pub auth_mode: String,

    /// ID of the currently active profile, if any.
    pub active_profile_id: Option<String>,

    /// Last successful provider authentication proof. This is not updated by
    /// local profile switching.
    pub last_login: Option<LastLogin>,
}

impl Default for ProfileAuth {
    fn default() -> Self {
        Self {
            schema: AUTH_SCHEMA_VERSION,
            auth_mode: AUTH_MODE_GOOGLE_OIDC_PKCE.to_string(),
            active_profile_id: None,
            last_login: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LastLogin {
    pub profile_id: String,
    pub provider: String,
    pub issuer: String,
    pub subject: String,
    pub authenticated_at: DateTime<Utc>,
    pub audience: String,
    pub scope: Vec<String>,
    pub pkce_method: String,
    pub id_token_issued_at: DateTime<Utc>,
    pub id_token_expires_at: DateTime<Utc>,
}

/// In-memory profile snapshot used by UI callers that need account state.
#[derive(Debug, Clone, Default)]
pub struct ProfileSnapshot {
    pub active_profile_id: Option<String>,
    pub active_profile: Option<Profile>,
    pub profiles: Vec<Profile>,
}

pub fn canonical_google_issuer(issuer: &str) -> &str {
    match issuer {
        "accounts.google.com" | GOOGLE_ISSUER => GOOGLE_ISSUER,
        other => other,
    }
}
