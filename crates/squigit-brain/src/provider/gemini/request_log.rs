// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::provider::gemini::transport::types::GeminiRequest;

static REQUEST_LOG_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub(crate) struct GeminiRequestLogContext<'a> {
    pub(crate) kind: &'a str,
    pub(crate) channel_id: Option<&'a str>,
    pub(crate) thread_id: Option<&'a str>,
    pub(crate) iteration: Option<usize>,
}

pub(crate) fn write_request_log(
    context: &GeminiRequestLogContext<'_>,
    request: &GeminiRequest,
) {
    let Some(path) = build_log_path(context) else {
        return;
    };

    let rendered = match serde_json::to_string_pretty(request) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[SquigitBrain] Failed to render Gemini request log: {error}");
            return;
        }
    };

    if let Err(error) = std::fs::write(&path, format!("{rendered}\n")) {
        eprintln!(
            "[SquigitBrain] Failed to write Gemini request log {}: {}",
            path.display(),
            error
        );
    }
}

fn build_log_path(context: &GeminiRequestLogContext<'_>) -> Option<PathBuf> {
    let repo_logs_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .parent()?
        .join("logs");
    if let Err(error) = std::fs::create_dir_all(&repo_logs_dir) {
        eprintln!(
            "[SquigitBrain] Failed to create logs directory {}: {}",
            repo_logs_dir.display(),
            error
        );
        return None;
    }
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S-%3f");
    let sequence = REQUEST_LOG_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut name = format!(
        "Squigit-LLM-{}-{}-{:04}",
        timestamp,
        sanitize_filename_component(context.kind),
        sequence
    );

    if let Some(thread_id) = context.thread_id {
        name.push('-');
        name.push_str(&sanitize_filename_component(thread_id));
    } else if let Some(channel_id) = context.channel_id {
        name.push('-');
        name.push_str(&sanitize_filename_component(channel_id));
    }

    if let Some(iteration) = context.iteration {
        name.push_str(&format!("-iter-{}", iteration));
    }

    name.push_str(".log");
    Some(repo_logs_dir.join(name))
}

fn sanitize_filename_component(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect();

    let trimmed = sanitized.trim_matches('_');
    let final_value = if trimmed.is_empty() { "request" } else { trimmed };
    final_value.chars().take(48).collect()
}
