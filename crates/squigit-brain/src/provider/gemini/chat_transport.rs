// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::sync::OnceLock;

use futures_util::StreamExt;
use serde_json::Value;
use squigit_storage::threads::types::CitationSource;
use tokio_util::sync::CancellationToken;

use crate::chat::{ChatEvent, ChatEventSink};

use super::transport::types::GeminiRequest;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub(crate) struct GeneratedContent {
    pub(crate) text: String,
    pub(crate) citations: Vec<CitationSource>,
}

fn endpoint(model: &str, streaming: bool) -> String {
    let model = model.trim_start_matches("models/");
    if streaming {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
        )
    } else {
        format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
    }
}

fn citations_from_candidate(candidate: &Value) -> Vec<CitationSource> {
    candidate
        .get("groundingMetadata")
        .and_then(|metadata| metadata.get("groundingChunks"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|chunk| {
            let web = chunk.get("web")?;
            let url = web.get("uri")?.as_str()?;
            if !url.starts_with("https://") && !url.starts_with("http://") {
                return None;
            }
            Some(CitationSource {
                title: web
                    .get("title")
                    .and_then(Value::as_str)
                    .filter(|title| !title.trim().is_empty())
                    .unwrap_or("Source")
                    .to_string(),
                url: url.to_string(),
                summary: String::new(),
                favicon_url: None,
                favicon_base64: None,
            })
        })
        .collect()
}

fn extract_chunk(value: &Value) -> Result<GeneratedContent, String> {
    if let Some(block) = value
        .get("promptFeedback")
        .and_then(|feedback| feedback.get("blockReason"))
        .and_then(Value::as_str)
    {
        return Err(format!("Gemini blocked this request: {block}"));
    }
    let candidate = value
        .get("candidates")
        .and_then(Value::as_array)
        .and_then(|candidates| candidates.first());
    let Some(candidate) = candidate else {
        return Ok(GeneratedContent {
            text: String::new(),
            citations: Vec::new(),
        });
    };
    if let Some(reason) = candidate.get("finishReason").and_then(Value::as_str) {
        if !matches!(reason, "STOP" | "MAX_TOKENS") {
            return Err(format!("Gemini stopped generation: {reason}"));
        }
    }
    let text = candidate
        .get("content")
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| part.get("thought").and_then(Value::as_bool) != Some(true))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<String>();
    Ok(GeneratedContent {
        text,
        citations: citations_from_candidate(candidate),
    })
}

async fn send(
    api_key: &str,
    model: &str,
    body: &GeminiRequest,
    streaming: bool,
    cancel: &CancellationToken,
) -> Result<reqwest::Response, String> {
    let client = CLIENT.get_or_init(reqwest::Client::new);
    let response = tokio::select! {
        result = client.post(endpoint(model, streaming))
            .header("x-goog-api-key", api_key)
            .json(body)
            .send() => result.map_err(|error| format!("Gemini transport error: {error}"))?,
        _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
    };
    if !response.status().is_success() {
        let status = response.status();
        let body = tokio::select! {
            result = response.text() => result.unwrap_or_default(),
            _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
        };
        return Err(format!(
            "Gemini API error ({status}): {}",
            body.chars().take(1000).collect::<String>()
        ));
    }
    Ok(response)
}

pub(crate) async fn generate_content(
    api_key: &str,
    model: &str,
    body: &GeminiRequest,
    cancel: &CancellationToken,
) -> Result<GeneratedContent, String> {
    let response = send(api_key, model, body, false, cancel).await?;
    let value: Value = tokio::select! {
        result = response.json() => result.map_err(|error| format!("Invalid Gemini response: {error}"))?,
        _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
    };
    let result = extract_chunk(&value)?;
    if result.text.trim().is_empty() {
        return Err("Gemini returned an empty response".to_string());
    }
    Ok(result)
}

pub(crate) async fn stream_content(
    api_key: &str,
    model: &str,
    body: &GeminiRequest,
    cancel: &CancellationToken,
    emit: &ChatEventSink,
) -> Result<GeneratedContent, String> {
    let response = send(api_key, model, body, true, cancel).await?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut text = String::new();
    let mut citations = Vec::new();
    'body: loop {
        let next = tokio::select! {
            value = tokio::time::timeout(std::time::Duration::from_secs(120), stream.next()) =>
                value.map_err(|_| if text.is_empty() { "Gemini stream stalled".to_string() } else { "PARTIAL_STREAM: Gemini stream stalled".to_string() })?,
            _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|error| {
            if text.is_empty() {
                format!("Gemini stream failed: {error}")
            } else {
                format!("PARTIAL_STREAM: Gemini stream failed: {error}")
            }
        })?;
        buffer.extend_from_slice(&chunk);
        while let Some(end) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=end).collect::<Vec<_>>();
            let line = std::str::from_utf8(&line).map_err(|error| {
                format!(
                    "{}Invalid Gemini stream encoding: {error}",
                    if text.is_empty() {
                        ""
                    } else {
                        "PARTIAL_STREAM: "
                    }
                )
            })?;
            let Some(data) = line.trim().strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                break 'body;
            }
            let value: Value = serde_json::from_str(data).map_err(|error| {
                format!(
                    "{}Invalid Gemini stream payload: {error}",
                    if text.is_empty() {
                        ""
                    } else {
                        "PARTIAL_STREAM: "
                    }
                )
            })?;
            let part = extract_chunk(&value).map_err(|error| {
                if text.is_empty() {
                    error
                } else {
                    format!("PARTIAL_STREAM: {error}")
                }
            })?;
            if !part.text.is_empty() {
                text.push_str(&part.text);
                emit(ChatEvent::Chunk { content: part.text });
            }
            citations.extend(part.citations);
        }
    }
    if text.trim().is_empty() {
        return Err("Gemini returned an empty response".to_string());
    }
    Ok(GeneratedContent { text, citations })
}
