// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Profile metadata stored in profiles.json.
///
/// Each profile represents a Google-authenticated user account,
/// containing identity information and serving as a container
/// for threads and BYOK keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    /// Unique ID derived from Google email (blake3 hash, first 16 chars).
    pub id: String,

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
    /// Create a new profile from Google auth data.
    ///
    /// The profile ID is automatically generated from the email address
    /// using a blake3 hash (first 16 characters).
    ///
    /// # Arguments
    ///
    /// * `email` - Google account email address
    /// * `name` - Display name from Google
    /// * `avatar_base64` - Optional base64 PNG data URL for the avatar
    /// * `avatar_url` - Optional original Google avatar URL
    pub fn new(
        email: &str,
        name: &str,
        avatar_base64: Option<String>,
        avatar_url: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Self::id_from_email(email),
            name: name.to_string(),
            email: email.to_string(),
            avatar_base64,
            avatar_url,
            created_at: now,
            last_used_at: now,
        }
    }

    /// Generate a deterministic profile ID from an email address.
    ///
    /// Uses blake3 hash of the lowercase email, taking first 16 hex characters.
    /// This ensures the same email always maps to the same profile ID.
    pub fn id_from_email(email: &str) -> String {
        let hash = blake3::hash(email.to_lowercase().trim().as_bytes());
        hash.to_hex()[..16].to_string()
    }

    /// Update the last_used_at timestamp to now.
    pub fn touch(&mut self) {
        self.last_used_at = Utc::now();
    }
}

/// Authentication state stored in auth.json.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileAuth {
    /// ID of the currently active profile, if any.
    #[serde(default)]
    pub active_profile_id: Option<String>,
}

/// In-memory profile snapshot used by UI callers that need account state.
#[derive(Debug, Clone, Default)]
pub struct ProfileSnapshot {
    pub active_profile_id: Option<String>,
    pub active_profile: Option<Profile>,
    pub profiles: Vec<Profile>,
}
