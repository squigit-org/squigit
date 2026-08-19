// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const AUTH_SCHEMA_VERSION: u32 = 1;
pub const KEY_FILE_SCHEMA_VERSION: u32 = 1;
pub const AUTH_MODE_GOOGLE_OIDC_PKCE: &str = "google_oidc_pkce";
pub const GOOGLE_PROVIDER: &str = "google";
pub const GOOGLE_PROFILE_ID_PREFIX: &str = "ggl";
pub const GOOGLE_ISSUER: &str = "https://accounts.google.com";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RecordCipher {
    #[serde(rename = "aes-256-gcm")]
    Aes256Gcm,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RecordKdf {
    HkdfSha256,
}

fn deserialize_fixed_base64url<'de, D, const N: usize>(
    deserializer: D,
) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let encoded = String::deserialize(deserializer)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(&encoded)
        .map_err(serde::de::Error::custom)?;
    if decoded.len() != N || URL_SAFE_NO_PAD.encode(decoded) != encoded {
        return Err(serde::de::Error::custom(format!(
            "expected canonical base64url without padding for exactly {N} bytes"
        )));
    }
    Ok(encoded)
}

fn deserialize_salt<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserialize_fixed_base64url::<D, 32>(deserializer)
}

fn deserialize_nonce<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserialize_fixed_base64url::<D, 12>(deserializer)
}

fn deserialize_ciphertext<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let encoded = String::deserialize(deserializer)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(&encoded)
        .map_err(serde::de::Error::custom)?;
    if decoded.len() < 16 || URL_SAFE_NO_PAD.encode(decoded) != encoded {
        return Err(serde::de::Error::custom(
            "expected canonical base64url without padding containing an AES-GCM tag",
        ));
    }
    Ok(encoded)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EncryptedKeyRecord {
    pub cipher: RecordCipher,
    pub width: u32,
    pub kdf: RecordKdf,
    #[serde(deserialize_with = "deserialize_salt")]
    pub salt: String,
    #[serde(deserialize_with = "deserialize_nonce")]
    pub nonce: String,
    #[serde(deserialize_with = "deserialize_ciphertext")]
    pub ciphertext: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct ProfileKeyRecords {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_ai_studio: Option<EncryptedKeyRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imgbb: Option<EncryptedKeyRecord>,
}

impl ProfileKeyRecords {
    pub fn get(&self, provider: &str) -> Option<&EncryptedKeyRecord> {
        match provider {
            "google-ai-studio" => self.google_ai_studio.as_ref(),
            "imgbb" => self.imgbb.as_ref(),
            _ => None,
        }
    }

    pub fn insert(
        &mut self,
        provider: &str,
        record: EncryptedKeyRecord,
    ) -> std::result::Result<Option<EncryptedKeyRecord>, &'static str> {
        match provider {
            "google-ai-studio" => Ok(self.google_ai_studio.replace(record)),
            "imgbb" => Ok(self.imgbb.replace(record)),
            _ => Err("unsupported API-key provider"),
        }
    }

    pub fn remove(&mut self, provider: &str) -> Option<EncryptedKeyRecord> {
        match provider {
            "google-ai-studio" => self.google_ai_studio.take(),
            "imgbb" => self.imgbb.take(),
            _ => None,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.google_ai_studio.is_none() && self.imgbb.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeyFile {
    pub schema: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_trusted_reveal: Option<DateTime<Utc>>,
    pub profiles: BTreeMap<String, ProfileKeyRecords>,
}

impl Default for KeyFile {
    fn default() -> Self {
        Self {
            schema: KEY_FILE_SCHEMA_VERSION,
            last_trusted_reveal: None,
            profiles: BTreeMap::new(),
        }
    }
}

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
        let hex = hash.to_hex();
        format!(
            "{GOOGLE_PROFILE_ID_PREFIX}-{}-{}-{}-{}",
            &hex[0..8],
            &hex[8..16],
            &hex[16..24],
            &hex[24..32]
        )
    }

    /// Return whether an ID uses the canonical Google profile format.
    pub fn is_canonical_id(id: &str) -> bool {
        let mut parts = id.split('-');
        if parts.next() != Some(GOOGLE_PROFILE_ID_PREFIX) {
            return false;
        }
        for _ in 0..4 {
            let Some(group) = parts.next() else {
                return false;
            };
            if group.len() != 8
                || !group
                    .bytes()
                    .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
            {
                return false;
            }
        }
        parts.next().is_none()
    }

    /// Return whether this profile ID matches its immutable Google identity.
    pub fn has_canonical_id(&self) -> bool {
        self.identity.provider == GOOGLE_PROVIDER
            && self.identity.issuer == canonical_google_issuer(&self.identity.issuer)
            && Self::is_canonical_id(&self.id)
            && self.id == Self::id_from_identity(&self.identity)
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
