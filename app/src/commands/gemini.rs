// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Window};
use std::io::BufRead;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiPart {
    text: Option<String>,
    #[serde(rename = "inlineData")]
    inline_data: Option<GeminiInlineData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiInlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponseCandidate {
    content: Option<GeminiResponseContent>,
    #[serde(rename = "finishReason")]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponseContent {
    parts: Option<Vec<GeminiResponsePart>>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponsePart {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponseChunk {
    candidates: Option<Vec<GeminiResponseCandidate>>,
}

#[derive(Debug, Serialize, Clone)]
struct GeminiEvent {
    token: String,
}

#[tauri::command]
pub async fn stream_gemini_chat(
    app: AppHandle,
    _window: Window,
    api_key: String,
    model: String,
    contents: Vec<GeminiContent>,
    channel_id: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}",
        model, api_key
    );

    let request_body = GeminiRequest { contents };

    let response = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to send request to Gemini: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API Error: {}", error_text));
    }

    // Read entire response body
    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Parse as JSON array of response chunks
    let chunks: Vec<GeminiResponseChunk> = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Gemini response: {} - Body: {}", e, &body[..body.len().min(500)]))?;
    
    for chunk in chunks {
        if let Some(candidates) = chunk.candidates {
            if let Some(first) = candidates.first() {
                if let Some(content) = &first.content {
                    if let Some(parts) = &content.parts {
                        for part in parts {
                            if let Some(text) = &part.text {
                                let _ = app.emit(&channel_id, GeminiEvent { token: text.clone() });
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}
