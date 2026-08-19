// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

#[allow(dead_code)]
pub(crate) fn is_transport_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("channel closed")
        || lower.contains("connection closed")
        || lower.contains("connection reset")
        || lower.contains("connection aborted")
        || lower.contains("operation timed out")
        || lower.contains("request timed out")
        || lower.contains("tcp connect error")
        || lower.contains("dns error")
        || lower.contains("failed to send request")
        || lower.contains("failed to read response")
        || lower.contains("stream error")
        || lower.contains("failed to parse gemini sse payload")
        || lower.contains("before a terminal completion event")
}

#[allow(dead_code)]
pub(crate) fn is_candidate_retryable_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("429")
        || lower.contains("resource_exhausted")
        || lower.contains("quota")
        || lower.contains("503")
        || lower.contains("high demand")
        || lower.contains("unavailable")
        || lower.contains("not found")
        || lower.contains("404")
        || lower.contains("empty response")
        || lower.contains("stream stalled")
        || lower.contains("finish reason max_tokens")
        || lower.contains("unsupported tool call")
}
