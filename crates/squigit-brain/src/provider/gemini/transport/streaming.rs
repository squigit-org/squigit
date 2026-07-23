// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::events::BrainEventSink;
use futures_util::StreamExt;
use std::time::Duration;

use super::types::{GeminiEvent, GeminiFunctionCall, GeminiRequest, GeminiResponseChunk};

fn redact_url_api_key(message: &str) -> String {
    let Some(key_start) = message.find("key=") else {
        return message.to_string();
    };
    let value_start = key_start + "key=".len();
    let value_end = message[value_start..]
        .find(|ch: char| "&) \n\r".contains(ch))
        .map(|offset| value_start + offset)
        .unwrap_or(message.len());

    let mut redacted = String::with_capacity(message.len());
    redacted.push_str(&message[..value_start]);
    redacted.push_str("<redacted>");
    redacted.push_str(&message[value_end..]);
    redacted
}

fn transport_error_message(context: &str, error: reqwest::Error) -> String {
    redact_url_api_key(&format!("{}: {}", context, error))
}

pub(crate) fn emit_event(sink: &dyn BrainEventSink, channel_id: &str, event: GeminiEvent) {
    sink.emit(channel_id, event);
}

pub(crate) struct StreamIterationResult {
    pub(crate) function_call: Option<GeminiFunctionCall>,
    pub(crate) function_call_thought_signature: Option<String>,
    pub(crate) text: String,
}

enum StreamPayloadControl {
    Continue,
    Complete,
}

fn process_stream_payload(
    sink: &dyn BrainEventSink,
    channel_id: &str,
    data: &str,
    full_text: &mut String,
    function_call: &mut Option<GeminiFunctionCall>,
    function_call_thought_signature: &mut Option<String>,
) -> Result<StreamPayloadControl, String> {
    let raw_payload = serde_json::from_str::<serde_json::Value>(data)
        .unwrap_or_else(|_| serde_json::Value::String(data.to_string()));
    emit_event(
        sink,
        channel_id,
        GeminiEvent::Debug {
            phase: "response.raw".to_string(),
            message: "Gemini SSE payload".to_string(),
            payload: Some(raw_payload),
        },
    );

    if data == "[DONE]" {
        return Ok(StreamPayloadControl::Complete);
    }

    let chunk_data = serde_json::from_str::<GeminiResponseChunk>(data)
        .map_err(|error| format!("Failed to parse Gemini SSE payload: {error}"))?;
    if let Some(block_reason) = chunk_data
        .prompt_feedback
        .as_ref()
        .and_then(|feedback| feedback.block_reason.as_deref())
    {
        return Err(format!("Gemini safety failure: {block_reason}"));
    }
    let Some(candidates) = chunk_data.candidates else {
        return Ok(StreamPayloadControl::Continue);
    };
    let Some(first) = candidates.first() else {
        return Ok(StreamPayloadControl::Continue);
    };

    if let Some(content) = &first.content {
        if let Some(parts) = &content.parts {
            for part in parts {
                if let Some(fc) = &part.function_call {
                    if function_call.is_none() {
                        *function_call = Some(fc.clone());
                        *function_call_thought_signature = part.thought_signature.clone();
                    }
                    continue;
                }
                if function_call.is_none() {
                    if let Some(text) = &part.text {
                        full_text.push_str(text);
                        emit_event(
                            sink,
                            channel_id,
                            GeminiEvent::Token {
                                token: text.clone(),
                            },
                        );
                    }
                }
            }
        }
    }

    let Some(finish_reason) = first.finish_reason.as_deref() else {
        return Ok(StreamPayloadControl::Continue);
    };
    if finish_reason == "STOP" {
        return Ok(StreamPayloadControl::Complete);
    }

    let finish_message = first
        .finish_message
        .as_deref()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(|message| format!(": {message}"))
        .unwrap_or_default();
    Err(format!(
        "Gemini generation stopped with finish reason {finish_reason}{finish_message}"
    ))
}

pub(crate) async fn stream_request_iteration(
    sink: &dyn BrainEventSink,
    client: &reqwest::Client,
    url: &str,
    request_body: &GeminiRequest,
    channel_id: &str,
    cancel_token: &tokio_util::sync::CancellationToken,
) -> Result<StreamIterationResult, String> {
    const STREAM_STALL_TIMEOUT: Duration = Duration::from_secs(120);

    let response_result = tokio::select! {
        res = tokio::time::timeout(STREAM_STALL_TIMEOUT, client.post(url).json(request_body).send()) => {
            match res {
                Ok(response) => response.map_err(|error| transport_error_message("Failed to send request to Gemini", error)),
                Err(_) => Err("Gemini stream stalled before receiving a response.".to_string()),
            }
        },
        _ = cancel_token.cancelled() => Err("CANCELLED".to_string()),
    };
    let response = response_result?;
    let response_status = response.status();

    emit_event(
        sink,
        channel_id,
        GeminiEvent::Debug {
            phase: "response.open".to_string(),
            message: "Gemini opened the streaming response".to_string(),
            payload: Some(serde_json::json!({
                "status": response_status.as_u16(),
            })),
        },
    );

    if !response_status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        emit_event(
            sink,
            channel_id,
            GeminiEvent::Debug {
                phase: "response.raw".to_string(),
                message: "Gemini returned an error response".to_string(),
                payload: Some(serde_json::json!({
                    "status": response_status.as_u16(),
                    "body": error_text,
                })),
            },
        );
        return Err(format!(
            "Gemini API Error ({response_status}): {error_text}"
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_text = String::new();
    let mut function_call: Option<GeminiFunctionCall> = None;
    let mut function_call_thought_signature: Option<String> = None;
    let mut completed = false;

    'stream_loop: loop {
        tokio::select! {
            chunk_result = tokio::time::timeout(STREAM_STALL_TIMEOUT, stream.next()) => {
                let chunk_opt = chunk_result
                    .map_err(|_| "Gemini stream stalled before producing a complete response.".to_string())?;
                match chunk_opt {
                    Some(Ok(chunk)) => {
                        buffer.push_str(&String::from_utf8_lossy(&chunk));
                        while let Some(idx) = buffer.find('\n') {
                            let line = buffer[..idx].to_string();
                            buffer.drain(..idx + 1);

                            let trimmed = line.trim();
                            if let Some(data) = trimmed.strip_prefix("data:") {
                                if matches!(
                                    process_stream_payload(
                                        sink,
                                        channel_id,
                                        data.trim_start(),
                                        &mut full_text,
                                        &mut function_call,
                                        &mut function_call_thought_signature,
                                    )?,
                                    StreamPayloadControl::Complete
                                ) {
                                    completed = true;
                                    break 'stream_loop;
                                }
                            }
                        }
                    }
                    Some(Err(error)) => return Err(transport_error_message("Stream error", error)),
                    None => {
                        let trailing = buffer.trim();
                        if let Some(data) = trailing.strip_prefix("data:") {
                            completed = matches!(
                                process_stream_payload(
                                    sink,
                                    channel_id,
                                    data.trim_start(),
                                    &mut full_text,
                                    &mut function_call,
                                    &mut function_call_thought_signature,
                                )?,
                                StreamPayloadControl::Complete
                            );
                        }
                        break;
                    },
                }
            }
            _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
        }
    }

    if !completed {
        return Err(
            "Gemini stream ended before a terminal completion event was received.".to_string(),
        );
    }

    emit_event(
        sink,
        channel_id,
        GeminiEvent::Debug {
            phase: "response.complete".to_string(),
            message: "Gemini response stream completed".to_string(),
            payload: Some(serde_json::json!({
                "textCharacters": full_text.chars().count(),
                "hasFunctionCall": function_call.is_some(),
            })),
        },
    );

    Ok(StreamIterationResult {
        function_call,
        function_call_thought_signature,
        text: full_text,
    })
}
