// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::credentials::ActiveCredential;
use super::errors::ProviderError;
use crate::jobs::{now_ms, JobControl};
use serde_json::{json, Value};
use std::collections::BTreeMap;

const MAX_EVENT_BYTES: usize = 8 * 1024 * 1024;

pub(crate) fn reasoning_text(message: &Value) -> String {
    let details = message["reasoning_details"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|detail| match detail["type"].as_str() {
            Some("reasoning.summary") => detail["summary"].as_str(),
            Some("reasoning.text") => detail["text"].as_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n");
    if details.is_empty() {
        message["reasoning"].as_str().unwrap_or("").to_string()
    } else {
        details
    }
}

struct Completion {
    response: Value,
    message: Value,
    calls: BTreeMap<u64, Value>,
    reasoning: Vec<Value>,
    published_reasoning: String,
    reasoning_dirty: bool,
    reasoning_started_at: u64,
    finish_reason: Option<String>,
}

impl Completion {
    fn new() -> Self {
        Self {
            response: json!({}),
            message: json!({"role":"assistant", "content":""}),
            calls: BTreeMap::new(),
            reasoning: Vec::new(),
            published_reasoning: String::new(),
            reasoning_dirty: false,
            reasoning_started_at: now_ms(),
            finish_reason: None,
        }
    }

    fn flush_reasoning(&mut self, job: &JobControl, credential: &ActiveCredential) {
        if !self.reasoning_dirty {
            return;
        }
        self.reasoning_dirty = false;
        self.message["reasoning_details"] = json!(self.reasoning);
        let public = reasoning_text(&self.message).replace(credential.api_key(), "[REDACTED]");
        let unpublished = public
            .strip_prefix(&self.published_reasoning)
            .unwrap_or(&public);
        if !unpublished.trim().is_empty() {
            job.tool(
                "thinking",
                unpublished.to_string(),
                self.reasoning_started_at,
                None,
            );
            self.reasoning_started_at = now_ms();
            job.phase("finalizing", None);
        }
        self.published_reasoning = public;
    }

    fn push(
        &mut self,
        chunk: Value,
        job: &JobControl,
        credential: &ActiveCredential,
        show_reasoning: bool,
    ) -> Result<(), ProviderError> {
        if chunk.get("error").is_some()
            || chunk.pointer("/choices/0/error").is_some()
            || chunk
                .pointer("/choices/0/finish_reason")
                .is_some_and(|reason| reason == "error")
        {
            return Err(ProviderError::response(200, &chunk));
        }
        if let Some(fields) = chunk.as_object() {
            for (key, value) in fields {
                if key != "choices" {
                    self.response[key] = value.clone();
                }
            }
        }
        if let Some(model) = chunk["model"].as_str() {
            job.update(|snapshot| {
                snapshot.actual_model = Some(model.to_string());
                snapshot.grounding.actual_model = Some(model.to_string());
            });
        }
        let Some(choice) = chunk["choices"].as_array().and_then(|choices| {
            choices
                .iter()
                .find(|choice| choice["index"].as_u64().unwrap_or(0) == 0)
        }) else {
            return Ok(());
        };
        let delta = &choice["delta"];
        let content = delta["content"].as_str().unwrap_or("");
        let tool_calls = delta["tool_calls"].as_array();
        if !content.is_empty() {
            append(&mut self.message, "content", content);
            job.phase("finalizing", None);
        }
        if let Some(refusal) = delta["refusal"].as_str() {
            append(&mut self.message, "refusal", refusal);
        }
        if let Some(reasoning) = delta["reasoning"]
            .as_str()
            .or_else(|| delta["reasoning_content"].as_str())
        {
            append(&mut self.message, "reasoning", reasoning);
            self.reasoning_dirty |= !reasoning.is_empty();
        }
        for detail in delta["reasoning_details"].as_array().into_iter().flatten() {
            self.reasoning_dirty = true;
            let index = detail["index"].as_u64();
            let id = detail["id"].as_str().filter(|id| !id.is_empty());
            let position = if let Some(index) = index {
                self.reasoning
                    .iter()
                    .position(|existing| existing["index"].as_u64() == Some(index))
            } else if let Some(id) = id {
                self.reasoning
                    .iter()
                    .position(|existing| existing["id"].as_str() == Some(id))
            } else {
                self.reasoning
                    .last()
                    .filter(|existing| existing["type"] == detail["type"])
                    .map(|_| self.reasoning.len() - 1)
            };
            let position = position.unwrap_or_else(|| {
                self.reasoning.push(json!({}));
                self.reasoning.len() - 1
            });
            if let Some(fields) = detail.as_object() {
                for (key, value) in fields {
                    if matches!(key.as_str(), "text" | "summary" | "data" | "signature") {
                        if let Some(text) = value.as_str() {
                            append(&mut self.reasoning[position], key, text);
                        }
                    } else if !value.is_null() {
                        self.reasoning[position][key] = value.clone();
                    }
                }
            }
        }
        if show_reasoning
            && (!content.is_empty() || tool_calls.is_some_and(|calls| !calls.is_empty()))
        {
            self.flush_reasoning(job, credential);
        }
        for call in tool_calls.into_iter().flatten() {
            let index = call["index"].as_u64().unwrap_or(0);
            let current = self
                .calls
                .entry(index)
                .or_insert_with(|| json!({"type":"function", "function":{}}));
            if let Some(id) = call["id"].as_str() {
                append(current, "id", id);
            }
            for key in ["name", "arguments"] {
                if let Some(fragment) = call["function"][key].as_str() {
                    append(&mut current["function"], key, fragment);
                }
            }
        }
        if let Some(reason) = choice["finish_reason"].as_str() {
            self.finish_reason = Some(reason.to_string());
        }
        Ok(())
    }

    fn finish(
        mut self,
        job: &JobControl,
        credential: &ActiveCredential,
        show_reasoning: bool,
    ) -> Result<Value, ProviderError> {
        if self.finish_reason.is_none() {
            return Err(ProviderError::new("network").with_details(json!({"httpStatus":200,"message":"Provider stream ended before the completion finished","response":self.response})));
        }
        if show_reasoning {
            self.flush_reasoning(job, credential);
        }
        self.message["reasoning_details"] = json!(self.reasoning);
        if !self.calls.is_empty() {
            self.message["tool_calls"] = json!(self.calls.into_values().collect::<Vec<_>>());
        }
        self.response["choices"] =
            json!([{"index":0,"message":self.message,"finish_reason":self.finish_reason}]);
        Ok(self.response)
    }
}

fn append(value: &mut Value, key: &str, fragment: &str) {
    if fragment.is_empty() {
        return;
    }
    if let Some(Value::String(current)) = value.get_mut(key) {
        current.push_str(fragment);
    } else {
        value[key] = Value::String(fragment.to_string());
    }
}

fn consume_event(
    data: &mut String,
    completion: &mut Completion,
    job: &JobControl,
    credential: &ActiveCredential,
    show_reasoning: bool,
) -> Result<bool, ProviderError> {
    if data.is_empty() {
        return Ok(false);
    }
    let event = std::mem::take(data);
    if event.trim() == "[DONE]" {
        return Ok(true);
    }
    let redacted = event.replace(credential.api_key(), "[REDACTED]");
    let chunk: Value = serde_json::from_str(&redacted).map_err(|error| {
        ProviderError::new("invalid-output").with_details(json!({"httpStatus":200,"message":"Malformed provider stream event","parseError":error.to_string(),"response":redacted}))
    })?;
    completion.push(chunk, job, credential, show_reasoning)?;
    Ok(false)
}

pub(crate) async fn collect(
    mut response: reqwest::Response,
    job: &JobControl,
    credential: &ActiveCredential,
    show_reasoning: bool,
) -> Result<Value, ProviderError> {
    let mut completion = Completion::new();
    let mut buffer = Vec::new();
    let mut data = String::new();
    loop {
        let chunk = response.chunk().await.map_err(|error| {
            ProviderError::new("network")
                .with_details(json!({"httpStatus":200,"message":error.to_string()}))
        })?;
        let Some(chunk) = chunk else { break };
        buffer.extend_from_slice(&chunk);
        if buffer.len() + data.len() > MAX_EVENT_BYTES {
            return Err(ProviderError::new("invalid-output").with_details(json!({"httpStatus":200,"message":"Provider stream event exceeded the buffer limit"})));
        }
        while let Some(end) = buffer.iter().position(|byte| *byte == b'\n') {
            let bytes = buffer.drain(..=end).collect::<Vec<_>>();
            let line = std::str::from_utf8(&bytes[..bytes.len() - 1]).map_err(|error| {
                ProviderError::new("invalid-output").with_details(json!({"httpStatus":200,"message":"Invalid provider stream encoding","parseError":error.to_string()}))
            })?.trim_end_matches('\r').trim_start_matches('\u{feff}');
            if line.is_empty() {
                if consume_event(&mut data, &mut completion, job, credential, show_reasoning)? {
                    return completion.finish(job, credential, show_reasoning);
                }
            } else if let Some(value) = line.strip_prefix("data:") {
                if !data.is_empty() {
                    data.push('\n');
                }
                data.push_str(value.strip_prefix(' ').unwrap_or(value));
            }
        }
    }
    if !buffer.is_empty() {
        let line = std::str::from_utf8(&buffer).map_err(|error| {
            ProviderError::new("invalid-output")
                .with_details(json!({"httpStatus":200,"parseError":error.to_string()}))
        })?;
        if let Some(value) = line.trim_end_matches('\r').strip_prefix("data:") {
            if !data.is_empty() {
                data.push('\n');
            }
            data.push_str(value.strip_prefix(' ').unwrap_or(value));
        }
    }
    consume_event(&mut data, &mut completion, job, credential, show_reasoning)?;
    completion.finish(job, credential, show_reasoning)
}
