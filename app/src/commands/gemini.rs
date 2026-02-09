// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Window};


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
    _finish_reason: Option<String>,
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

/// Brain-aware chat command (v2)
/// 
/// For initial turns (is_initial_turn=true):
///   - Uses soul.yml + scenes.json to build system prompt
///   - Requires image_base64 and image_mime_type
/// 
/// For subsequent turns (is_initial_turn=false):
///   - Uses frame.md template with context anchors
///   - Requires image_description, user_first_msg, history_log
#[tauri::command]
pub async fn stream_gemini_chat_v2(
    app: AppHandle,
    api_key: String,
    model: String,
    is_initial_turn: bool,
    // Initial turn params
    image_base64: Option<String>,
    image_mime_type: Option<String>,
    // Subsequent turn params
    image_description: Option<String>,
    user_first_msg: Option<String>,
    history_log: Option<String>,
    // Current user message (empty on first turn for image-only analysis)
    user_message: String,
    channel_id: String,
) -> Result<(), String> {
    use crate::brain::processor::{build_initial_system_prompt, build_turn_context};
    
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}",
        model, api_key
    );

    // Build contents based on turn type
    let contents: Vec<GeminiContent> = if is_initial_turn {
        // Initial turn: soul + scenes + image
        let system_prompt = build_initial_system_prompt()?;
        
        let image_b64 = image_base64.ok_or("image_base64 required for initial turn")?;
        let mime = image_mime_type.ok_or("image_mime_type required for initial turn")?;
        
        let mut parts = vec![
            GeminiPart {
                text: None,
                inline_data: Some(GeminiInlineData {
                    mime_type: mime,
                    data: image_b64,
                }),
            },
            GeminiPart {
                text: Some(system_prompt),
                inline_data: None,
            },
        ];
        
        // Add user message if provided
        if !user_message.is_empty() {
            parts.push(GeminiPart {
                text: Some(user_message),
                inline_data: None,
            });
        }
        
        vec![GeminiContent {
            role: "user".to_string(),
            parts,
        }]
    } else {
        // Subsequent turn: frame.md with context
        let img_desc = image_description.ok_or("image_description required for subsequent turns")?;
        let first_msg = user_first_msg.unwrap_or_default();
        let history = history_log.unwrap_or_default();
        
        let context_prompt = build_turn_context(&img_desc, &first_msg, &history);
        
        vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![
                GeminiPart {
                    text: Some(context_prompt),
                    inline_data: None,
                },
                GeminiPart {
                    text: Some(user_message),
                    inline_data: None,
                },
            ],
        }]
    };

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

    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    
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

/// Generate a chat title for an image using the brain's title prompt.
/// Returns the generated title text directly.
#[tauri::command]
pub async fn generate_chat_title(
    api_key: String,
    model: String,
    image_base64: String,
    image_mime_type: String,
) -> Result<String, String> {
    use crate::brain::processor::get_title_prompt;
    
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let title_prompt = get_title_prompt()?;
    
    let contents = vec![GeminiContent {
        role: "user".to_string(),
        parts: vec![
            GeminiPart {
                text: None,
                inline_data: Some(GeminiInlineData {
                    mime_type: image_mime_type,
                    data: image_base64,
                }),
            },
            GeminiPart {
                text: Some(title_prompt),
                inline_data: None,
            },
        ],
    }];

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

    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Parse single response (not streaming array)
    let chunk: GeminiResponseChunk = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Gemini response: {} - Body: {}", e, &body[..body.len().min(500)]))?;
    
    // Extract text from response
    if let Some(candidates) = chunk.candidates {
        if let Some(first) = candidates.first() {
            if let Some(content) = &first.content {
                if let Some(parts) = &content.parts {
                    for part in parts {
                        if let Some(text) = &part.text {
                            return Ok(text.trim().to_string());
                        }
                    }
                }
            }
        }
    }
    
    Ok("New Chat".to_string())
}
