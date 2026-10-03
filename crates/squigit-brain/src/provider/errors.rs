// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde_json::{json, Value};
use squigit_storage::AssistantError;

#[derive(Debug, Clone)]
pub(crate) struct ProviderError {
    pub(crate) kind: &'static str,
    pub(crate) retryable: bool,
    pub(crate) retry_after: Option<u64>,
    pub(crate) details: Value,
}
impl ProviderError {
    pub(crate) fn new(kind: &'static str) -> Self {
        Self {
            kind,
            retryable: matches!(kind, "network" | "rate-limit" | "overloaded"),
            retry_after: None,
            details: json!({"code":kind}),
        }
    }
    pub(crate) fn with_details(mut self, details: Value) -> Self {
        self.details = details;
        self
    }
    pub(crate) fn response(status: u16, body: &Value) -> Self {
        let error = body
            .get("error")
            .or_else(|| body.pointer("/choices/0/error"))
            .unwrap_or(body);
        let code = error
            .pointer("/metadata/error_type")
            .and_then(Value::as_str)
            .or_else(|| error["code"].as_str())
            .unwrap_or("");
        let source = error
            .pointer("/metadata/limit_source")
            .and_then(Value::as_str)
            .unwrap_or("");
        let message = error["message"].as_str().unwrap_or("").to_ascii_lowercase();
        let http_status = status;
        let status = error["code"]
            .as_u64()
            .and_then(|value| u16::try_from(value).ok())
            .unwrap_or(status);
        let kind = if matches!(source, "openrouter_credits" | "openrouter_key_limit") {
            "payment"
        } else if message.contains("free-models-per-day")
            || (message.contains("daily")
                && (message.contains("quota") || message.contains("limit"))
                && (source.starts_with("openrouter")
                    || error.pointer("/metadata/provider_name").is_none()))
        {
            "quota"
        } else {
            match code {
                "authentication" | "invalid_api_key" => "authentication",
                "payment_required" | "insufficient_credits" | "spending_limit_exceeded" => {
                    "payment"
                }
                "permission_denied" | "access_denied" => "permission",
                "rate_limit_exceeded" | "too_many_requests" => "rate-limit",
                "provider_overloaded"
                | "provider_unavailable"
                | "server"
                | "server_error"
                | "internal_server_error"
                | "timeout" => "overloaded",
                "content_policy_violation" | "refusal" | "guardrail_triggered" => "content-blocked",
                "not_found" | "model_not_found" => "model-unavailable",
                "invalid_request"
                | "invalid_prompt"
                | "precondition_failed"
                | "payload_too_large"
                | "unprocessable"
                | "invalid_image"
                | "image_too_large"
                | "image_too_small"
                | "unsupported_image_format"
                | "image_not_found"
                | "image_download_failed"
                | "context_length_exceeded"
                | "max_tokens_exceeded"
                | "token_limit_exceeded"
                | "string_too_long"
                | "invalid_tool_call" => "invalid-request",
                _ => match status {
                    401 => "authentication",
                    402 => "payment",
                    403 => "permission",
                    404 => "model-unavailable",
                    408 | 502 | 500 | 503 | 504 => "overloaded",
                    429 => "rate-limit",
                    400 | 413 | 422 => "invalid-request",
                    _ => "unexpected",
                },
            }
        };
        let mut result =
            Self::new(kind).with_details(json!({"httpStatus":http_status, "response":body}));
        // Only the in-flight budget is replenished by waiting; credits and key caps are terminal.
        if source == "openrouter_in_flight_budget" {
            result.retryable = true;
        }
        result
    }
    pub(crate) fn local(message: &str) -> Self {
        let lower = message.to_ascii_lowercase();
        Self::new(if lower.contains("cancelled") {
            "stopped"
        } else if lower.contains("credential") || lower.contains("profile") || lower.contains("key")
        {
            "authentication"
        } else if lower.contains("model") {
            "model-unavailable"
        } else if lower.contains("connect") || lower.contains("timed out") {
            "network"
        } else {
            "unexpected"
        })
        .with_details(json!({"message":message}))
    }
    pub(crate) fn user_error(&self) -> AssistantError {
        AssistantError { kind:self.kind.to_string(), message: match self.kind {
            "stopped" => "you stopped this response",
            "network" => "I couldn't connect. Check your internet connection and try again.",
            "rate-limit" => "Too many requests right now. Please wait a little and try again.",
            "quota" => "Your OpenRouter daily free usage limit has been reached. Try again after it resets.",
            "overloaded" => "The model is busy right now. Please try again in a moment.",
            "authentication" => "Your OpenRouter key needs attention. Update it in Settings and try again.",
            "payment" => "Your OpenRouter account needs available credits or a higher spending limit for this model.",
            "permission" => "Your OpenRouter key doesn't have access to this request. Check its permissions in Settings.",
            "invalid-model" => "Choose a model in Settings before sending a message.",
            "model-unavailable" => "No compatible model is currently available for this request. Please try again later.",
            "content-blocked" => "The model couldn't respond to this request. Try rephrasing it.",
            "invalid-request" => "The model could not process this request. Try a shorter prompt or fewer attachments.",
            "output-budget" => "The model used its output budget before completing an answer. Try a lower effort or a smaller request.",
            "empty-output" => "The model returned no answer. Please try again.",
            _ => "An unexpected error occurred. Please try again.",
        }.to_string() }
    }
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(
            self.details["message"]
                .as_str()
                .unwrap_or(&self.user_error().message),
        )
    }
}
