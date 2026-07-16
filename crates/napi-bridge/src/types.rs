// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi_derive::napi;
use squigit_brain::provider::gemini::transport::types::GeminiEvent;
use squigit_storage::{Profile as UserProfile, ProfileSnapshot, StoredImage};

#[napi(object)]
pub struct NapiProfile {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_base64: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub last_used_at: String,
}

impl From<UserProfile> for NapiProfile {
    fn from(profile: UserProfile) -> Self {
        Self {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatar_base64: profile.avatar_base64,
            avatar_url: profile.avatar_url,
            created_at: profile.created_at.to_rfc3339(),
            last_used_at: profile.last_used_at.to_rfc3339(),
        }
    }
}

#[napi(object)]
pub struct NapiProfileSnapshot {
    pub active_profile_id: Option<String>,
    pub active_profile: Option<NapiProfile>,
    pub profiles: Vec<NapiProfile>,
}

impl From<ProfileSnapshot> for NapiProfileSnapshot {
    fn from(snapshot: ProfileSnapshot) -> Self {
        Self {
            active_profile_id: snapshot.active_profile_id,
            active_profile: snapshot.active_profile.map(Into::into),
            profiles: snapshot.profiles.into_iter().map(Into::into).collect(),
        }
    }
}

#[napi(object)]
pub struct NapiAuthResult {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_base64: Option<String>,
    pub avatar_url: Option<String>,
}

#[napi(object)]
pub struct NapiStoredImage {
    pub hash: String,
    pub path: String,
    pub tone: Option<String>,
}

impl From<StoredImage> for NapiStoredImage {
    fn from(image: StoredImage) -> Self {
        Self {
            hash: image.hash,
            path: image.path,
            tone: image.tone,
        }
    }
}

/// Stream event sent via ThreadsafeFunction callback.
#[napi(object)]
pub struct NapiStreamEvent {
    pub event_type: String,
    pub token: Option<String>,
    pub message: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
    pub status: Option<String>,
    pub args: Option<String>,
    pub result: Option<String>,
}

#[napi(object)]
pub struct NapiSttOptions {
    pub model: Option<String>,
    pub language: Option<String>,
}

#[napi(object)]
pub struct NapiSttEvent {
    pub event_type: String,
    pub text: Option<String>,
    pub is_final: Option<bool>,
    pub status: Option<String>,
    pub message: Option<String>,
}

impl From<GeminiEvent> for NapiStreamEvent {
    fn from(event: GeminiEvent) -> Self {
        match event {
            GeminiEvent::Token { token } => Self {
                event_type: "token".to_string(),
                token: Some(token),
                message: None,
                id: None,
                name: None,
                status: None,
                args: None,
                result: None,
            },
            GeminiEvent::Reset => Self {
                event_type: "reset".to_string(),
                token: None,
                message: None,
                id: None,
                name: None,
                status: None,
                args: None,
                result: None,
            },
            GeminiEvent::ToolStatus { message } => Self {
                event_type: "tool_status".to_string(),
                token: None,
                message: Some(message),
                id: None,
                name: None,
                status: None,
                args: None,
                result: None,
            },
            GeminiEvent::ToolStart {
                id,
                name,
                args,
                message,
            } => Self {
                event_type: "tool_start".to_string(),
                token: None,
                message: Some(message),
                id: Some(id),
                name: Some(name),
                status: None,
                args: Some(serde_json::to_string(&args).unwrap_or_default()),
                result: None,
            },
            GeminiEvent::ToolEnd {
                id,
                name,
                status,
                result,
                message,
            } => Self {
                event_type: "tool_end".to_string(),
                token: None,
                message: Some(message),
                id: Some(id),
                name: Some(name),
                status: Some(status),
                args: None,
                result: Some(serde_json::to_string(&result).unwrap_or_default()),
            },
        }
    }
}
