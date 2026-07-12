// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi_derive::napi;
use squigit_auth::types::Profile as UserProfile;
use squigit_brain::provider::gemini::transport::types::GeminiEvent;
use squigit_memory::{StoredImage, ThreadData, ThreadMessage, ThreadMetadata};

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

impl From<squigit_auth::types::ProfileSnapshot> for NapiProfileSnapshot {
    fn from(snapshot: squigit_auth::types::ProfileSnapshot) -> Self {
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

#[napi(object)]
pub struct NapiThreadMetadata {
    pub id: String,
    pub title: String,
    pub image_hash: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_pinned: bool,
    pub ocr_lang: Option<String>,
    pub image_tone: Option<String>,
    pub reverse_image_search_url: Option<String>,
}

impl From<ThreadMetadata> for NapiThreadMetadata {
    fn from(meta: ThreadMetadata) -> Self {
        Self {
            id: meta.id,
            title: meta.title,
            image_hash: meta.image_hash,
            created_at: meta.created_at.to_rfc3339(),
            updated_at: meta.updated_at.to_rfc3339(),
            is_pinned: meta.is_pinned,
            ocr_lang: meta.ocr_lang,
            image_tone: meta.image_tone,
            reverse_image_search_url: meta.reverse_image_search_url,
        }
    }
}

#[napi(object)]
pub struct NapiThreadMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

impl From<ThreadMessage> for NapiThreadMessage {
    fn from(msg: ThreadMessage) -> Self {
        Self {
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp.to_rfc3339(),
        }
    }
}

#[napi(object)]
pub struct NapiThreadData {
    pub metadata: NapiThreadMetadata,
    pub messages: Vec<NapiThreadMessage>,
    pub rolling_summary: Option<String>,
    pub image_brief: Option<String>,
}

impl From<ThreadData> for NapiThreadData {
    fn from(data: ThreadData) -> Self {
        Self {
            metadata: data.metadata.into(),
            messages: data.messages.into_iter().map(|m| m.into()).collect(),
            rolling_summary: data.rolling_summary,
            image_brief: data.image_brief,
        }
    }
}

#[napi(object)]
pub struct NapiAnalyzeResult {
    pub thread_id: String,
    pub title: String,
    pub assistant_message: String,
    pub image_path: String,
    pub image_brief: Option<String>,
}

#[napi(object)]
pub struct NapiPromptResult {
    pub thread_id: String,
    pub assistant_message: String,
    pub normalized_user_message: String,
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
