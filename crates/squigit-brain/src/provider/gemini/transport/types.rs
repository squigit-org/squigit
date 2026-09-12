// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(rename = "fileData", skip_serializing_if = "Option::is_none")]
    pub file_data: Option<GeminiFileData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiFileData {
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(rename = "fileUri")]
    pub file_uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GeminiContent {
    pub(crate) role: String,
    pub(crate) parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
pub(crate) struct GeminiRequest {
    pub(crate) contents: Vec<GeminiContent>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponseCandidate {
    pub(crate) content: Option<GeminiResponseContent>,
    #[serde(rename = "finishReason")]
    pub(crate) finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponseContent {
    pub(crate) parts: Option<Vec<GeminiResponsePart>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponsePart {
    pub(crate) text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponseChunk {
    pub(crate) candidates: Option<Vec<GeminiResponseCandidate>>,
    #[serde(rename = "promptFeedback")]
    pub(crate) prompt_feedback: Option<GeminiPromptFeedback>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiPromptFeedback {
    #[serde(rename = "blockReason")]
    pub(crate) block_reason: Option<String>,
}
