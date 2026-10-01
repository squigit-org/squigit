// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::sync::atomic::{AtomicU64, Ordering};

use super::errors::ProviderError;
use crate::jobs::JobSnapshot;
use serde_json::{json, Value};

static ERROR_LOG_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub(crate) fn error_diagnostic(job: &JobSnapshot, error: &ProviderError) -> Value {
    json!({
        "sequence": ERROR_LOG_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        "recordedAtMs": crate::jobs::now_ms(),
        "jobId": job.job_id,
        "threadId": job.thread_id,
        "task": job.task,
        "model": job.actual_model,
        "nextModel": job.next_model,
        "attempt": job.attempt,
        "errorKind": error.kind,
        "retryAfterMs": job.retry_after_ms,
        "providerRetryAfterMs": error.retry_after.map(|seconds| seconds.saturating_mul(1000)),
        "details": error.details,
    })
}
