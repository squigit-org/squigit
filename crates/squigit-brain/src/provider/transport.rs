// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::credentials::ActiveCredential;
use super::errors::ProviderError;
use super::models::Candidate;
use crate::jobs::JobControl;
use crate::runtime::BrainRuntimeState;
use serde_json::{json, Value};
use std::time::Duration;

pub(crate) struct RequestSpec {
    pub(crate) input: Vec<Value>,
    pub(crate) system_instruction: String,
    pub(crate) tools: Vec<Value>,
    pub(crate) schema: Option<Value>,
    pub(crate) effort: Option<String>,
    pub(crate) free: bool,
    pub(crate) utility: bool,
    pub(crate) force_web_search: bool,
    pub(crate) message_id: Option<String>,
}
pub(crate) fn text(text: impl Into<String>) -> Value {
    json!({"type":"text", "text":text.into()})
}

pub(crate) async fn execute(
    runtime: &BrainRuntimeState,
    job: &JobControl,
    credential: &ActiveCredential,
    candidates: &[Candidate],
    spec: RequestSpec,
    scope: Option<&super::tools::ConversationTools>,
) -> Result<String, ProviderError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| ProviderError::local(&error.to_string()))?;
    if candidates.is_empty() {
        return Err(ProviderError::new("model-unavailable"));
    }
    let original = {
        let mut messages = vec![json!({"role":"system", "content":spec.system_instruction})];
        messages.extend(spec.input.clone());
        messages
    };
    let mut messages = original.clone();
    let mut model_index = 0;
    let mut unavailable_models = vec![false; candidates.len()];
    let mut bound_model: Option<String> = None;
    let mut rounds = 0;
    let mut calls = 0;
    let mut media_ready = false;
    let mut prepared_images: Option<Vec<Value>> = None;
    let mut searched = false;
    let mut audio_disabled = spec.free.then_some(super::media::FREE_AUDIO_REASON);
    loop {
        if rounds >= 24 {
            return Err(ProviderError::new("invalid-request"));
        }
        let candidate = &candidates[model_index];
        if !media_ready {
            if let Some(tools) = scope {
                let content = if let Some(content) = &prepared_images {
                    content.clone()
                } else {
                    let content = super::media::initial_inputs(
                        runtime,
                        job,
                        credential,
                        candidate,
                        tools,
                        spec.free,
                        &mut audio_disabled,
                    )
                    .await?;
                    if tools.uploads.iter().all(|hash| {
                        tools.manifest.iter().any(|entry| {
                            &entry.attachment_hash == hash
                                && entry.file_type == squigit_storage::AttachmentFileType::Image
                        })
                    }) {
                        prepared_images = Some(content.clone());
                    }
                    content
                };
                if !content.is_empty() {
                    let message = messages
                        .iter_mut()
                        .rev()
                        .find(|message| message["role"] == "user")
                        .ok_or_else(|| ProviderError::new("invalid-request"))?;
                    message["content"]
                        .as_array_mut()
                        .ok_or_else(|| ProviderError::new("invalid-request"))?
                        .extend(content);
                }
            }
            media_ready = true;
        }
        let model = bound_model.as_deref().unwrap_or(&candidate.id);
        let output_budget = candidate.output_budget(spec.utility);
        let mut body = json!({"model":model, "messages":messages, "stream":spec.schema.is_none(), "max_tokens":output_budget, "provider":{"require_parameters":true}});
        if spec.effort.as_deref() == Some("instant") {
            body["reasoning"] = if spec.free {
                json!({"exclude":true})
            } else {
                candidate.instant_reasoning()
            };
        } else if let Some(reasoning) = candidate.reasoning(spec.effort.as_deref(), output_budget) {
            body["reasoning"] = reasoning;
        } else if spec.utility {
            body["reasoning"] = candidate.instant_reasoning();
        } else if spec.effort.as_deref() != Some("xhigh") {
            body["reasoning"] = json!({"exclude":true});
        }
        if !spec.tools.is_empty() {
            body["tools"] = json!(spec
                .tools
                .iter()
                .filter(|tool| audio_disabled.is_none()
                    || tool["function"]["name"] != "transcribe_audio")
                .collect::<Vec<_>>());
        }
        if !spec.free && !spec.utility && spec.force_web_search && !searched {
            body["plugins"] = json!([{"id":"web"}]);
            body["web_search_options"] =
                json!({"search_context_size":super::web::context_size(spec.effort.as_deref())});
        }
        if let Some(schema) = &spec.schema {
            body["response_format"] = json!({"type":"json_schema", "json_schema":{"name":"utility_result", "strict":true, "schema":schema}});
        }
        job.update(|snapshot| {
            if !spec.utility || snapshot.phase == "retrying" {
                snapshot.phase = "thinking".to_string();
                snapshot.target = None;
            }
            snapshot.status = "running".to_string();
            snapshot.actual_model = Some(model.to_string());
            snapshot.grounding.actual_model = Some(model.to_string());
            snapshot.next_model = None;
            snapshot.attempt += 1;
            snapshot.retry_after_ms = None;
        });
        let slots = if spec.utility {
            runtime.worker.micro_slots.clone()
        } else {
            runtime.worker.main_slots.clone()
        };
        let permit = tokio::select! {
            permit = slots.acquire_owned() => permit.map_err(|_| ProviderError::new("unexpected"))?,
            _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")),
        };
        let grounding_checkpoint = job.grounding_tool_count();
        let native_search = if body.get("plugins").is_some() {
            job.phase("browsing", None);
            Some(job.begin_tool("web_search", "Browsing the web".into(), None))
        } else {
            None
        };
        let result = tokio::select! {
            result = send(&client, credential, &body, job, spec.effort.as_deref() == Some("xhigh")) => result,
            _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")),
        };
        drop(permit);
        let response = match result {
            Ok(response) => response,
            Err(mut error) => {
                job.update(|snapshot| snapshot.grounding.tools.truncate(grounding_checkpoint));
                if let Some(actual) = error
                    .details
                    .pointer("/response/model")
                    .and_then(Value::as_str)
                    .or_else(|| {
                        error
                            .details
                            .pointer("/response/error/metadata/model")
                            .and_then(Value::as_str)
                    })
                {
                    job.update(|snapshot| {
                        snapshot.actual_model = Some(actual.to_string());
                        snapshot.grounding.actual_model = Some(actual.to_string());
                    });
                }
                let has_audio = messages.iter().any(|message| {
                    message["content"].as_array().is_some_and(|parts| {
                        parts.iter().any(|part| {
                            matches!(part["type"].as_str(), Some("input_audio" | "video_url"))
                        })
                    })
                });
                if scope.is_some()
                    && audio_disabled.is_none()
                    && has_audio
                    && matches!(
                        error.kind,
                        "payment"
                            | "permission"
                            | "invalid-request"
                            | "model-unavailable"
                            | "unexpected"
                            | "empty-output"
                    )
                {
                    job.report_error(&error);
                    audio_disabled = Some(super::media::audio_failure_reason(&error));
                    messages = original.clone();
                    media_ready = false;
                    bound_model = None;
                    rounds = 0;
                    calls = 0;
                    searched = false;
                    job.update(|snapshot| {
                        snapshot.phase = "thinking".into();
                        snapshot.target = None;
                        snapshot
                            .grounding
                            .tools
                            .retain(|tool| tool.kind != "thinking");
                        for tool in &mut snapshot.grounding.tools {
                            if tool.ended_at_ms.is_none()
                                && matches!(tool.kind.as_str(), "upload_audio" | "upload_video")
                            {
                                tool.content =
                                    "Audio omitted; continuing with available content".into();
                                tool.ended_at_ms = Some(crate::jobs::now_ms());
                            }
                        }
                    });
                    continue;
                }
                if spec.free && error.kind == "rate-limit" {
                    let remaining = tokio::select! {
                        remaining = free_daily_remaining(&client, credential) => remaining,
                        _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")),
                    };
                    if let Some(0) = remaining {
                        error.kind = "quota";
                        error.retryable = false;
                        error.details["freeDailyRemaining"] = json!(0);
                    }
                }
                let unavailable = spec.free && error.kind == "model-unavailable";
                if !error.retryable && !unavailable {
                    return Err(error);
                }
                if unavailable {
                    unavailable_models[model_index] = true;
                }
                let next_index = if spec.free {
                    let next = (1..=candidates.len())
                        .map(|offset| (model_index + offset) % candidates.len())
                        .find(|index| !unavailable_models[*index]);
                    let Some(next) = next else {
                        return Err(error);
                    };
                    next
                } else {
                    model_index
                };
                let delay = if unavailable {
                    0
                } else {
                    error.retry_after.unwrap_or(30).max(1)
                };
                job.update(|snapshot| {
                    snapshot.status = "retrying".to_string();
                    snapshot.phase = "retrying".to_string();
                    snapshot.next_model = Some(candidates[next_index].id.clone());
                    snapshot.retry_after_ms = Some(delay.saturating_mul(1000));
                });
                job.report_error(&error);
                if delay > 0 {
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_secs(delay)) => {},
                        _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")),
                    }
                }
                if next_index != model_index {
                    model_index = next_index;
                    media_ready = false;
                    messages = original.clone();
                    bound_model = None;
                    rounds = 0;
                    calls = 0;
                    searched = false;
                    job.update(|snapshot| {
                        snapshot
                            .grounding
                            .tools
                            .retain(|tool| tool.kind != "thinking")
                    });
                }
                continue;
            }
        };
        if let Some(step) = native_search {
            job.finish_tool(&step, "Browsed the web".into());
            searched = true;
        }
        let native_calls = response
            .pointer("/usage/server_tool_use/web_search_requests")
            .and_then(Value::as_u64)
            .map(|calls| calls.min(u32::MAX as u64) as u32)
            .unwrap_or_else(|| {
                u32::from(
                    response
                        .pointer("/choices/0/message/annotations")
                        .and_then(Value::as_array)
                        .is_some_and(|items| {
                            items.iter().any(|item| item["type"] == "url_citation")
                        }),
                )
            });
        super::usage::tool(credential, job, "web_search", native_calls).await;
        tokio::select! {
            _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")),
            _ = super::web::native_sources(job, &response) => {},
        }
        super::media::finish_uploads(job);
        rounds += 1;
        if let Some(model) = response["model"]
            .as_str()
            .map(str::to_string)
            .or_else(|| job.snapshot().and_then(|snapshot| snapshot.actual_model))
        {
            bound_model = Some(model.clone());
            if let (Some(message_id), Some(snapshot)) = (&spec.message_id, job.snapshot()) {
                let profile_id = credential.profile_id.clone();
                let conversation_id = snapshot.thread_id;
                let message_id = message_id.clone();
                let model = model.to_string();
                let updated = tokio::task::spawn_blocking(move || {
                    squigit_storage::UsageStore::new()?.record_message(
                        &profile_id,
                        &conversation_id,
                        &message_id,
                        &model,
                    )
                })
                .await;
                match updated {
                    Ok(Ok(())) => {}
                    Ok(Err(error)) => job.report_error(&ProviderError::local(&error.to_string())),
                    Err(error) => job.report_error(&ProviderError::local(&error.to_string())),
                }
            }
            job.update(|snapshot| {
                snapshot.actual_model = Some(model.to_string());
                snapshot.grounding.actual_model = Some(model.to_string());
            });
        }
        let choice = response.pointer("/choices/0").ok_or_else(|| {
            ProviderError::new("empty-output")
                .with_details(json!({"httpStatus":200,"response":response}))
        })?;
        let message = &choice["message"];
        let function_calls = message["tool_calls"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default();
        if function_calls.is_empty() {
            if choice["finish_reason"] == "length" {
                return Err(ProviderError::new("output-budget")
                    .with_details(json!({"httpStatus":200,"response":response})));
            }
            if choice["finish_reason"] == "content_filter"
                || message.get("refusal").is_some_and(|v| !v.is_null())
            {
                return Err(ProviderError::new("content-blocked")
                    .with_details(json!({"httpStatus":200,"response":response})));
            }
            let content = message["content"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| {
                    message["content"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|part| part["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("")
                });
            if content.trim().is_empty() {
                return Err(ProviderError::new("empty-output")
                    .with_details(json!({"httpStatus":200,"response":response})));
            }
            if !spec.utility {
                job.phase("finalizing", None);
            }
            return if spec.utility {
                Ok(content)
            } else {
                super::web::finalize(
                    runtime, job, credential, candidate, spec.free, content, message,
                )
                .await
            };
        }
        let tools = scope.ok_or_else(|| ProviderError::new("invalid-request"))?;
        let mut assistant =
            json!({"role":"assistant", "content":message["content"], "tool_calls":function_calls});
        for key in ["reasoning", "reasoning_details"] {
            if let Some(value) = message.get(key) {
                assistant[key] = value.clone();
            }
        }
        messages.push(assistant);
        let mut internal_images = Vec::new();
        let mut ids = std::collections::HashSet::new();
        for call in function_calls {
            calls += 1;
            if calls > 32
                || call["id"].as_str().filter(|id| !id.is_empty()).is_none()
                || !ids.insert(call["id"].clone())
            {
                return Err(ProviderError::new("invalid-request"));
            }
            let arguments = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .ok_or_else(|| ProviderError::new("invalid-request"))?;
            let mut arguments: Value = serde_json::from_str(arguments).map_err(|error| ProviderError::new("invalid-request").with_details(json!({"message":"Malformed tool arguments", "tool":call["function"]["name"], "parseError":error.to_string()})))?;
            if !arguments.is_object() {
                return Err(ProviderError::new("invalid-request"));
            }
            if call["function"]["name"] == groundweb::TOOL_NAME
                && !searched
                && arguments["urls"].as_array().is_none_or(Vec::is_empty)
                && !tools.pasted_urls.is_empty()
            {
                arguments["urls"] = json!(tools.pasted_urls);
            }
            let (ack, images) = tokio::select! {
                result = super::tools::execute(runtime, job, credential, candidate, &mut audio_disabled, tools, call, &arguments) => result,
                _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")),
            };
            if call["function"]["name"] == groundweb::TOOL_NAME {
                searched = true;
            }
            messages.push(ack);
            internal_images.extend(images);
        }
        if !internal_images.is_empty() {
            messages.push(json!({"role":"user", "content":internal_images}));
        }
    }
}

async fn free_daily_remaining(
    client: &reqwest::Client,
    credential: &ActiveCredential,
) -> Option<u64> {
    let response = client
        .get("https://openrouter.ai/api/v1/key")
        .bearer_auth(credential.api_key())
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: Value = response.json().await.ok()?;
    body.pointer("/data/free_model_daily_requests/remaining")
        .and_then(Value::as_u64)
}
pub(crate) async fn send(
    client: &reqwest::Client,
    credential: &ActiveCredential,
    body: &Value,
    job: &JobControl,
    show_reasoning: bool,
) -> Result<Value, ProviderError> {
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .bearer_auth(credential.api_key())
        .header("X-Title", "Squigit")
        .header("X-OpenRouter-Metadata", "enabled")
        .json(body)
        .send()
        .await
        .map_err(|error| {
            ProviderError::new("network").with_details(json!({"message":error.to_string()}))
        })?;
    let status = response.status();
    let generation_id = response
        .headers()
        .get("x-generation-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let mut usage = if status.is_success() {
        Some(
            super::usage::RequestUsage::begin(
                credential,
                job,
                body["model"].as_str().unwrap_or(""),
                generation_id,
            )
            .await,
        )
    } else {
        None
    };
    let retry_header = response
        .headers()
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let retry_after = retry_header.as_deref().and_then(|value| {
        value.parse::<u64>().ok().or_else(|| {
            chrono::DateTime::parse_from_rfc2822(value)
                .ok()
                .map(|date| {
                    date.timestamp()
                        .saturating_sub(chrono::Utc::now().timestamp())
                        .max(0) as u64
                })
        })
    });
    let event_stream = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/event-stream"));
    if status.is_success() && event_stream {
        return super::stream::collect(
            response,
            job,
            credential,
            show_reasoning,
            usage.as_mut().unwrap(),
        )
        .await
        .map_err(|mut error| {
            error.retry_after = retry_after;
            error.details["retryAfter"] = json!(retry_header);
            if error.kind == "payment" && retry_after.is_none() {
                error.retryable = false;
            }
            error
        });
    }
    let raw = response.text().await.map_err(|error| {
        ProviderError::new("network")
            .with_details(json!({"httpStatus":status.as_u16(), "message":error.to_string()}))
    })?;
    // Providers occasionally echo secrets in their error metadata. Diagnostics never retain those values.
    let raw = raw.replace(credential.api_key(), "[REDACTED]");
    let response = serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| Value::String(raw));
    if let Some(usage) = &mut usage {
        usage.record(&response, job).await;
    }
    if !status.is_success()
        || response.get("error").is_some()
        || response.pointer("/choices/0/error").is_some()
        || response
            .pointer("/choices/0/finish_reason")
            .is_some_and(|value| value == "error")
    {
        let mut error = ProviderError::response(status.as_u16(), &response);
        error.retry_after = retry_after;
        error.details["retryAfter"] = json!(retry_header);
        if error.kind == "payment" && retry_after.is_none() {
            error.retryable = false;
        }
        return Err(error);
    }
    if show_reasoning {
        if let Some(message) = response.pointer("/choices/0/message") {
            let public = super::stream::reasoning_text(message);
            if !public.trim().is_empty() {
                job.tool("thinking", public, crate::jobs::now_ms(), None);
                job.phase("thinking", None);
            }
        }
    }
    Ok(response)
}
