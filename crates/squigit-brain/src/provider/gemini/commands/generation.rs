// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::provider::gemini::fallback::{is_candidate_retryable_error, is_transport_error};
use crate::provider::gemini::request_log::{write_request_log, GeminiRequestLogContext};
use crate::provider::gemini::transport::types::{
    GeminiContent, GeminiFileData, GeminiPart, GeminiRequest, GeminiResponseChunk,
};
use crate::runtime::BrainRuntimeState;
use std::time::Duration;

fn extract_generated_text(body: &str) -> Result<String, String> {
    let chunk: GeminiResponseChunk = serde_json::from_str(body).map_err(|error| {
        format!(
            "Failed to parse Gemini response: {error} - Body: {}",
            &body[..body.len().min(500)]
        )
    })?;

    if let Some(block_reason) = chunk
        .prompt_feedback
        .as_ref()
        .and_then(|feedback| feedback.block_reason.as_deref())
    {
        return Err(format!("Gemini safety failure: {block_reason}"));
    }

    if let Some(candidates) = chunk.candidates {
        if let Some(first) = candidates.first() {
            if let Some(finish_reason) = first.finish_reason.as_deref() {
                if matches!(
                    finish_reason,
                    "SAFETY" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII" | "IMAGE_SAFETY"
                ) {
                    return Err(format!("Gemini safety failure: {finish_reason}"));
                }
            }
            if let Some(parts) = first
                .content
                .as_ref()
                .and_then(|content| content.parts.as_ref())
            {
                if let Some(text) = parts.iter().find_map(|part| part.text.as_deref()) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return Ok(trimmed.to_string());
                    }
                }
            }
        }
    }

    Err("Gemini returned an empty response.".to_string())
}

async fn generate_with_candidate(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    request_body: &GeminiRequest,
) -> Result<String, String> {
    const MAX_TRANSPORT_RETRIES: usize = 2;

    let model_id = model.strip_prefix("models/").unwrap_or(model);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key}"
    );
    let mut transport_retries = 0usize;

    loop {
        let response = match client.post(&url).json(request_body).send().await {
            Ok(response) => response,
            Err(error) => {
                let message = format!("Failed to send request to Gemini: {error}");
                if is_transport_error(&message) && transport_retries < MAX_TRANSPORT_RETRIES {
                    transport_retries += 1;
                    tokio::time::sleep(Duration::from_millis(750 * transport_retries as u64)).await;
                    continue;
                }
                return Err(message);
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API Error ({status}): {error_text}"));
        }

        let body = match response.text().await {
            Ok(body) => body,
            Err(error) => {
                let message = format!("Failed to read response: {error}");
                if is_transport_error(&message) && transport_retries < MAX_TRANSPORT_RETRIES {
                    transport_retries += 1;
                    tokio::time::sleep(Duration::from_millis(750 * transport_retries as u64)).await;
                    continue;
                }
                return Err(message);
            }
        };

        return extract_generated_text(&body);
    }
}

async fn generate_with_candidates(
    api_key: &str,
    model_candidates: &[String],
    request_body: &GeminiRequest,
) -> Result<String, String> {
    if model_candidates.is_empty() {
        return Err("At least one model candidate is required.".to_string());
    }

    let client = reqwest::Client::new();
    let mut last_error = "All model candidates failed.".to_string();

    for (index, model) in model_candidates.iter().enumerate() {
        match generate_with_candidate(&client, api_key, model, request_body).await {
            Ok(text) => return Ok(text),
            Err(error) => {
                let has_next = index + 1 < model_candidates.len();
                let may_switch = has_next && is_candidate_retryable_error(&error);
                last_error = error;
                if !may_switch {
                    return Err(last_error);
                }
            }
        }
    }

    Err(last_error)
}

/// Generate a thread title using the supplied micro-task candidate plan.
pub async fn generate_thread_title(
    api_key: String,
    model_candidates: Vec<String>,
    prompt_context: String,
) -> Result<String, String> {
    use crate::context::builder::get_title_prompt;

    let title_context = prompt_context
        .lines()
        .take(3)
        .collect::<Vec<&str>>()
        .join("\n");
    let title_prompt_base = get_title_prompt().map_err(|error| error.to_string())?;
    let title_prompt = format!("{title_prompt_base}\n\nContext:\n{title_context}");
    let request_body = GeminiRequest {
        system_instruction: None,
        contents: vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart {
                text: Some(title_prompt),
                ..Default::default()
            }],
        }],
        generation_config: None,
        tools: None,
        tool_config: None,
    };

    write_request_log(
        &GeminiRequestLogContext {
            kind: "title_generation",
            channel_id: None,
            thread_id: None,
            iteration: None,
        },
        &request_body,
    );

    match generate_with_candidates(&api_key, &model_candidates, &request_body).await {
        Ok(title) => Ok(title),
        Err(error) => {
            eprintln!("[ThreadTitle] Candidate plan failed: {error}");
            Ok("New thread".to_string())
        }
    }
}

/// Generate a lightweight image description using the supplied micro-task plan.
pub async fn generate_image_brief(
    runtime: &BrainRuntimeState,
    api_key: String,
    image_path: String,
    model_candidates: Vec<String>,
) -> Result<String, String> {
    use crate::context::builder::get_image_brief_prompt;

    let brief_prompt = get_image_brief_prompt()?;
    let file_ref = crate::provider::gemini::attachments::ensure_file_uploaded(
        &api_key,
        &image_path,
        &runtime.provider_file_cache,
    )
    .await?;
    let request_body = GeminiRequest {
        system_instruction: None,
        contents: vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![
                GeminiPart {
                    file_data: Some(GeminiFileData {
                        mime_type: file_ref.mime_type,
                        file_uri: file_ref.file_uri,
                    }),
                    ..Default::default()
                },
                GeminiPart {
                    text: Some(brief_prompt),
                    ..Default::default()
                },
            ],
        }],
        generation_config: None,
        tools: None,
        tool_config: None,
    };

    write_request_log(
        &GeminiRequestLogContext {
            kind: "image_brief",
            channel_id: None,
            thread_id: None,
            iteration: None,
        },
        &request_body,
    );

    match generate_with_candidates(&api_key, &model_candidates, &request_body).await {
        Ok(brief) => Ok(brief),
        Err(error) => {
            eprintln!("[ImageBrief] Candidate plan failed: {error}");
            Ok(String::new())
        }
    }
}
