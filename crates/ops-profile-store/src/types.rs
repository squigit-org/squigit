// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Type definitions for profile storage.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Profile metadata stored in profile.json.
///
/// Each profile represents a Google-authenticated user account,
/// containing identity information and serving as a container
/// for chats and BYOK keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    /// Unique ID derived from Google email (blake3 hash, first 16 chars).
    pub id: String,

    /// Display name from Google account.
    pub name: String,

    /// Email address from Google account.
    pub email: String,

    /// Local path to cached avatar image (CAS path).
    #[serde(default)]
    pub avatar: Option<String>,

    /// Original Google avatar URL for refresh.
    #[serde(default)]
    pub original_avatar: Option<String>,

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
    /// * `avatar` - Optional local path to cached avatar
    /// * `original_avatar` - Optional original Google avatar URL
    pub fn new(
        email: &str,
        name: &str,
        avatar: Option<String>,
        original_avatar: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Self::id_from_email(email),
            name: name.to_string(),
            email: email.to_string(),
            avatar,
            original_avatar,
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

/// Index file tracking all profiles and the active profile.
///
/// Stored at `{config_dir}/snapllm/Local Storage/index.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileIndex {
    /// ID of the currently active profile, if any.
    #[serde(default)]
    pub active_profile_id: Option<String>,

    /// List of all profile IDs for quick enumeration.
    #[serde(default)]
    pub profile_ids: Vec<String>,
}

impl ProfileIndex {
    /// Check if a profile ID exists in the index.
    pub fn contains(&self, id: &str) -> bool {
        self.profile_ids.iter().any(|p| p == id)
    }

    /// Add a profile ID to the index if not already present.
    pub fn add(&mut self, id: String) {
        if !self.contains(&id) {
            self.profile_ids.push(id);
        }
    }

    /// Remove a profile ID from the index.
    pub fn remove(&mut self, id: &str) {
        self.profile_ids.retain(|p| p != id);
        // Clear active if it was the removed profile
        if self.active_profile_id.as_deref() == Some(id) {
            self.active_profile_id = self.profile_ids.first().cloned();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_profile_id_from_email() {
        let id1 = Profile::id_from_email("user@gmail.com");
        let id2 = Profile::id_from_email("USER@gmail.com");
        let id3 = Profile::id_from_email("  user@gmail.com  ");

        // Same email (case-insensitive, trimmed) should produce same ID
        assert_eq!(id1, id2);
        assert_eq!(id1, id3);

        // ID should be 16 characters (hex)
        assert_eq!(id1.len(), 16);

        // Different email should produce different ID
        let id4 = Profile::id_from_email("other@gmail.com");
        assert_ne!(id1, id4);
    }

    #[test]
    fn test_profile_index_operations() {
        let mut index = ProfileIndex::default();

        index.add("profile1".to_string());
        assert!(index.contains("profile1"));
        assert!(!index.contains("profile2"));

        index.add("profile2".to_string());
        index.active_profile_id = Some("profile1".to_string());

        // Remove active profile should switch to next
        index.remove("profile1");
        assert!(!index.contains("profile1"));
        assert_eq!(index.active_profile_id, Some("profile2".to_string()));
    }
}
