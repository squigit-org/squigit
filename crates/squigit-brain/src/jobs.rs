// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::Serialize;
use squigit_storage::{AssistantError, GroundingResource, GroundingTool, MessageGrounding};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

use crate::provider::errors::ProviderError;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub job_id: String,
    pub thread_id: String,
    pub task: String,
    pub status: String,
    pub phase: String,
    pub target: Option<String>,
    pub actual_model: Option<String>,
    pub next_model: Option<String>,
    pub attempt: u32,
    pub retry_after_ms: Option<u64>,
    pub content: Option<String>,
    pub error: Option<AssistantError>,
    pub diagnostics: Vec<serde_json::Value>,
    pub grounding: MessageGrounding,
}

impl JobSnapshot {
    pub fn is_terminal(&self) -> bool {
        matches!(self.status.as_str(), "completed" | "failed" | "cancelled")
    }
}

struct JobRecord {
    snapshot: JobSnapshot,
    cancellation: CancellationToken,
}

#[derive(Clone)]
pub(crate) struct JobWorker {
    records: Arc<Mutex<BTreeMap<String, JobRecord>>>,
    pub(crate) main_slots: Arc<Semaphore>,
    pub(crate) micro_slots: Arc<Semaphore>,
}

pub(crate) struct JobControl {
    pub(crate) id: String,
    pub(crate) cancellation: CancellationToken,
    worker: JobWorker,
}

pub(crate) fn now_ms() -> u64 {
    chrono::Utc::now().timestamp_millis().max(0) as u64
}

pub(crate) fn new_job_id() -> String {
    format!("api-{:032x}", rand::random::<u128>())
}

impl JobWorker {
    pub(crate) fn new() -> Self {
        Self {
            records: Arc::new(Mutex::new(BTreeMap::new())),
            main_slots: Arc::new(Semaphore::new(6)),
            micro_slots: Arc::new(Semaphore::new(2)),
        }
    }

    pub(crate) fn register(
        &self,
        id: String,
        thread_id: String,
        task: &str,
    ) -> Result<JobControl, String> {
        let mut records = self
            .records
            .lock()
            .map_err(|_| "Job state is unavailable")?;
        if records.contains_key(&id) {
            return Err("Job ID is already in use".to_string());
        }
        if task == "conversation"
            && records.values().any(|record| {
                record.snapshot.task == task
                    && record.snapshot.thread_id == thread_id
                    && !record.snapshot.is_terminal()
            })
        {
            return Err("This conversation already has a response running".to_string());
        }
        while records.len() >= 256 {
            let oldest = records
                .iter()
                .filter(|(_, record)| record.snapshot.is_terminal())
                .min_by_key(|(_, record)| record.snapshot.grounding.started_at_ms)
                .map(|(id, _)| id.clone());
            match oldest {
                Some(id) => {
                    records.remove(&id);
                }
                None => {
                    return Err("Too many jobs are running. Please try again shortly.".to_string())
                }
            }
        }
        let cancellation = CancellationToken::new();
        records.insert(
            id.clone(),
            JobRecord {
                snapshot: JobSnapshot {
                    job_id: id.clone(),
                    thread_id,
                    task: task.to_string(),
                    status: "queued".to_string(),
                    phase: "thinking".to_string(),
                    target: None,
                    actual_model: None,
                    next_model: None,
                    attempt: 0,
                    retry_after_ms: None,
                    content: None,
                    error: None,
                    diagnostics: Vec::new(),
                    grounding: MessageGrounding {
                        selected_model: String::new(),
                        actual_model: None,
                        started_at_ms: now_ms(),
                        duration_ms: None,
                        tools: Vec::new(),
                    },
                },
                cancellation: cancellation.clone(),
            },
        );
        Ok(JobControl {
            id,
            cancellation,
            worker: self.clone(),
        })
    }

    pub(crate) fn snapshots(&self) -> Vec<JobSnapshot> {
        self.records
            .lock()
            .map(|records| {
                records
                    .values()
                    .map(|record| record.snapshot.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub(crate) fn snapshot(&self, id: &str) -> Option<JobSnapshot> {
        self.records
            .lock()
            .ok()?
            .get(id)
            .map(|record| record.snapshot.clone())
    }

    pub(crate) fn cancel(&self, id: &str) {
        if let Ok(mut records) = self.records.lock() {
            if let Some(record) = records.get_mut(id) {
                if !record.snapshot.is_terminal() {
                    record.cancellation.cancel();
                    record.snapshot.status = "cancelled".to_string();
                    record.snapshot.error = Some(ProviderError::new("stopped").user_error());
                    for tool in &mut record.snapshot.grounding.tools {
                        if tool.ended_at_ms.is_none() {
                            tool.content = format!("Stopped: {}", tool.content);
                            tool.ended_at_ms = Some(now_ms());
                        }
                    }
                    record.snapshot.next_model = None;
                    record.snapshot.retry_after_ms = None;
                    record.snapshot.grounding.duration_ms =
                        Some(now_ms().saturating_sub(record.snapshot.grounding.started_at_ms));
                }
            }
        }
    }
}

impl JobControl {
    pub(crate) fn snapshot(&self) -> Option<JobSnapshot> {
        self.worker.snapshot(&self.id)
    }

    pub(crate) fn grounding_tool_count(&self) -> usize {
        self.worker
            .snapshot(&self.id)
            .map_or(0, |snapshot| snapshot.grounding.tools.len())
    }

    pub(crate) fn report_error(&self, error: &ProviderError) {
        let Some(snapshot) = self.worker.snapshot(&self.id) else {
            return;
        };
        if snapshot.diagnostics.last().is_some_and(|diagnostic| {
            diagnostic["attempt"] == snapshot.attempt
                && diagnostic["errorKind"] == error.kind
                && diagnostic["details"] == error.details
        }) {
            return;
        }
        let diagnostic = crate::provider::request_log::error_diagnostic(&snapshot, error);
        self.update(|snapshot| snapshot.diagnostics.push(diagnostic));
    }

    pub(crate) fn update(&self, update: impl FnOnce(&mut JobSnapshot)) {
        if let Ok(mut records) = self.worker.records.lock() {
            if let Some(record) = records.get_mut(&self.id) {
                if !record.snapshot.is_terminal() && !self.cancellation.is_cancelled() {
                    update(&mut record.snapshot);
                }
            }
        }
    }

    pub(crate) fn phase(&self, phase: &str, target: Option<String>) {
        self.update(|snapshot| {
            snapshot.phase = phase.to_string();
            snapshot.target = target;
        });
    }

    pub(crate) fn begin_tool(
        &self,
        kind: &str,
        content: String,
        resource: Option<GroundingResource>,
    ) -> String {
        let id = new_job_id();
        self.update(|snapshot| {
            snapshot.grounding.tools.push(GroundingTool {
                id: id.clone(),
                kind: kind.into(),
                content,
                resource,
                started_at_ms: now_ms(),
                ended_at_ms: None,
            })
        });
        id
    }
    pub(crate) fn finish_tool(&self, id: &str, content: String) {
        self.update(|snapshot| {
            if let Some(tool) = snapshot
                .grounding
                .tools
                .iter_mut()
                .find(|tool| tool.id == id)
            {
                tool.content = content;
                tool.ended_at_ms = Some(now_ms());
            }
        });
    }
    pub(crate) fn parse_control(&self) -> squigit_harness::parser::ParseControl {
        let worker = self.worker.clone();
        let id = self.id.clone();
        let cancellation = self.cancellation.clone();
        squigit_harness::parser::ParseControl::with_progress(move |text| {
            if cancellation.is_cancelled() {
                return;
            }
            if let Ok(mut records) = worker.records.lock() {
                if let Some(record) = records.get_mut(&id) {
                    if !record.snapshot.is_terminal() {
                        record.snapshot.phase = "parsing".into();
                        record.snapshot.target = Some(text);
                    }
                }
            }
        })
    }

    pub(crate) fn tool(
        &self,
        kind: &str,
        content: String,
        started_at_ms: u64,
        resource: Option<GroundingResource>,
    ) {
        self.update(|snapshot| {
            snapshot.grounding.tools.push(GroundingTool {
                id: new_job_id(),
                kind: kind.to_string(),
                content,
                resource,
                started_at_ms,
                ended_at_ms: Some(now_ms()),
            })
        });
    }

    pub(crate) fn finish(&self, result: Result<String, ProviderError>) {
        if let Err(error) = &result {
            if error.kind != "stopped" {
                self.report_error(error);
            }
        }
        self.update(|snapshot| {
            snapshot.grounding.duration_ms =
                Some(now_ms().saturating_sub(snapshot.grounding.started_at_ms));
            for tool in &mut snapshot.grounding.tools {
                if tool.ended_at_ms.is_none() {
                    if result.is_err() {
                        tool.content = format!("Interrupted: {}", tool.content);
                    }
                    tool.ended_at_ms = Some(now_ms());
                }
            }
            snapshot.phase = "finalizing".to_string();
            snapshot.retry_after_ms = None;
            snapshot.next_model = None;
            match result {
                Ok(content) => {
                    snapshot.status = "completed".to_string();
                    snapshot.content = Some(content);
                }
                Err(error) => {
                    snapshot.status = if error.kind == "stopped" {
                        "cancelled"
                    } else {
                        "failed"
                    }
                    .to_string();
                    snapshot.error = Some(error.user_error());
                }
            }
        });
    }
}

impl Drop for JobControl {
    fn drop(&mut self) {
        self.worker.cancel(&self.id);
    }
}
