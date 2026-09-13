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
    #[serde(rename = "systemInstruction")]
    pub(crate) system_instruction: GeminiSystemInstruction,
    #[serde(rename = "generationConfig")]
    pub(crate) generation_config: GeminiGenerationConfig,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GeminiSystemInstruction {
    pub(crate) parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) temperature: Option<f32>,
    #[serde(rename = "responseMimeType", skip_serializing_if = "Option::is_none")]
    pub(crate) response_mime_type: Option<String>,
    #[serde(rename = "responseSchema", skip_serializing_if = "Option::is_none")]
    pub(crate) response_schema: Option<GeminiResponseSchema>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GeminiResponseSchema {
    #[serde(rename = "type")]
    pub(crate) schema_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) properties: Option<std::collections::HashMap<String, GeminiResponseSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) required: Option<Vec<String>>,
}

impl GeminiResponseSchema {
    pub(crate) fn title_schema() -> Self {
        let mut properties = std::collections::HashMap::new();
        properties.insert(
            "title".to_string(),
            GeminiResponseSchema {
                schema_type: "STRING".to_string(),
                properties: None,
                required: None,
            },
        );
        Self {
            schema_type: "OBJECT".to_string(),
            properties: Some(properties),
            required: Some(vec!["title".to_string()]),
        }
    }
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
