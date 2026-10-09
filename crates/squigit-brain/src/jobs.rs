// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::Serialize;
use squigit_storage::{
    AssistantError, CitationSource, GroundingResource, GroundingTool, MessageGrounding,
};
use std::collections::{BTreeMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::{Notify, Semaphore};
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
    pub citations: Vec<CitationSource>,
}

impl JobSnapshot {
    pub fn is_terminal(&self) -> bool {
        matches!(self.status.as_str(), "completed" | "failed" | "cancelled")
    }
}

struct JobRecord {
    snapshot: JobSnapshot,
    cancellation: CancellationToken,
    parent_id: Option<String>,
    steering_root: String,
    active_id: String,
    steers: VecDeque<crate::SteerRequest>,
    steering: Arc<Notify>,
    delivered: CancellationToken,
    accepts_steering: bool,
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
    pub(crate) steering: Arc<Notify>,
    pub(crate) delivered: CancellationToken,
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
        self.register_job(id, thread_id, task, None)
    }

    pub(crate) fn register_child(
        &self,
        id: String,
        parent: &JobControl,
        task: &str,
    ) -> Result<JobControl, String> {
        let thread_id = parent
            .snapshot()
            .ok_or("Response job is unavailable")?
            .thread_id;
        self.register_job(id, thread_id, task, Some(parent.id.clone()))
    }

    fn make_room(records: &mut BTreeMap<String, JobRecord>) -> Result<(), String> {
        while records.len() >= 256 {
            let oldest = records
                .iter()
                .filter(|(_, record)| {
                    record.snapshot.is_terminal()
                        && records
                            .get(&record.steering_root)
                            .is_none_or(|root| !root.accepts_steering)
                })
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
        Ok(())
    }

    fn register_job(
        &self,
        id: String,
        thread_id: String,
        task: &str,
        parent_id: Option<String>,
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
                matches!(record.snapshot.task.as_str(), "conversation" | "steer")
                    && record.snapshot.thread_id == thread_id
                    && !record.snapshot.is_terminal()
            })
        {
            return Err("This conversation already has a response running".to_string());
        }
        Self::make_room(&mut records)?;
        let cancellation = if let Some(parent_id) = &parent_id {
            let parent = records
                .get(parent_id)
                .and_then(|record| records.get(&record.active_id))
                .ok_or("Response job is unavailable")?;
            if parent.snapshot.is_terminal() || parent.cancellation.is_cancelled() {
                return Err("Response stopped before its helper could start".into());
            }
            parent.cancellation.child_token()
        } else {
            CancellationToken::new()
        };
        let steering = Arc::new(Notify::new());
        let delivered = CancellationToken::new();
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
                    citations: Vec::new(),
                    grounding: MessageGrounding {
                        selected_model: String::new(),
                        actual_model: None,
                        started_at_ms: now_ms(),
                        duration_ms: None,
                        tools: Vec::new(),
                    },
                },
                cancellation: cancellation.clone(),
                parent_id,
                steering_root: id.clone(),
                active_id: id.clone(),
                steers: VecDeque::new(),
                steering: steering.clone(),
                delivered: delivered.clone(),
                accepts_steering: task == "conversation",
            },
        );
        Ok(JobControl {
            id,
            cancellation,
            worker: self.clone(),
            steering,
            delivered,
        })
    }

    pub(crate) fn steer(&self, id: &str, request: crate::SteerRequest) -> Result<String, String> {
        let mut records = self
            .records
            .lock()
            .map_err(|_| "Job state is unavailable")?;
        Self::make_room(&mut records)?;
        let record = records.get(id).ok_or("Response job is unavailable")?;
        let root_id = record.steering_root.clone();
        let root = records.get(&root_id).ok_or("Response job is unavailable")?;
        if root.active_id != id || !root.accepts_steering || root.cancellation.is_cancelled() {
            return Err("This response can no longer be steered".into());
        }
        if request.conversation.id() != record.snapshot.thread_id {
            return Err("Steering belongs to a different conversation".into());
        }
        if !request.visible_content.is_empty()
            && !record
                .snapshot
                .content
                .as_ref()
                .is_some_and(|content| content.starts_with(&request.visible_content))
        {
            return Err("Steering contains text outside the visible response".into());
        }
        let steering = root.steering.clone();
        let cancellation = root.cancellation.clone();
        let delivered = root.delivered.clone();
        let new_id = new_job_id();
        let mut snapshot = record.snapshot.clone();
        snapshot.job_id = new_id.clone();
        snapshot.task = "steer".into();
        snapshot.status = "queued".into();
        snapshot.phase = "thinking".into();
        snapshot.target = None;
        snapshot.content = None;
        snapshot.error = None;
        snapshot.attempt = 0;
        snapshot.retry_after_ms = None;
        snapshot.next_model = None;
        snapshot.diagnostics.clear();
        snapshot.citations.clear();
        snapshot.grounding.tools.clear();
        snapshot.grounding.started_at_ms = now_ms();
        snapshot.grounding.duration_ms = None;
        let previous = &mut records.get_mut(id).unwrap().snapshot;
        previous.status = "completed".into();
        previous.phase = "finalizing".into();
        previous.content = Some(request.visible_content.clone());
        previous.grounding.duration_ms =
            Some(now_ms().saturating_sub(previous.grounding.started_at_ms));
        for tool in &mut previous.grounding.tools {
            if tool.ended_at_ms.is_none() {
                tool.ended_at_ms = Some(now_ms());
            }
        }
        records.insert(
            new_id.clone(),
            JobRecord {
                snapshot,
                cancellation,
                parent_id: Some(id.to_string()),
                steering_root: root_id.clone(),
                active_id: new_id.clone(),
                steers: VecDeque::new(),
                steering: steering.clone(),
                delivered,
                accepts_steering: false,
            },
        );
        let root = records.get_mut(&root_id).unwrap();
        root.active_id = new_id.clone();
        root.steers.push_back(request);
        steering.notify_one();
        Ok(new_id)
    }

    pub(crate) fn can_steer(&self, id: &str) -> bool {
        let Ok(records) = self.records.lock() else {
            return false;
        };
        records
            .get(id)
            .and_then(|record| records.get(&record.steering_root))
            .is_some_and(|root| {
                root.active_id == id && root.accepts_steering && !root.cancellation.is_cancelled()
            })
    }

    pub(crate) fn complete_delivery(&self, id: &str) {
        let Ok(mut records) = self.records.lock() else {
            return;
        };
        let Some(record) = records.get(id) else {
            return;
        };
        if !record.snapshot.is_terminal() {
            return;
        }
        let root_id = record.steering_root.clone();
        if let Some(root) = records.get_mut(&root_id) {
            if root.active_id == id {
                root.accepts_steering = false;
                root.delivered.cancel();
            }
        }
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
            let root_id = records
                .get(id)
                .map(|record| record.steering_root.clone())
                .unwrap_or_else(|| id.to_string());
            let mut cancelled = vec![root_id];
            let mut cursor = 0;
            while cursor < cancelled.len() {
                let parent_id = &cancelled[cursor];
                let children = records
                    .iter()
                    .filter(|(_, record)| record.parent_id.as_ref() == Some(parent_id))
                    .map(|(id, _)| id.clone())
                    .collect::<Vec<_>>();
                cancelled.extend(children);
                cursor += 1;
            }
            for id in cancelled {
                let Some(record) = records.get_mut(&id) else {
                    continue;
                };
                record.cancellation.cancel();
                record.accepts_steering = false;
                if !record.snapshot.is_terminal() {
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
        let records = self.worker.records.lock().ok()?;
        let root = records.get(&self.id)?;
        records
            .get(&root.active_id)
            .map(|record| record.snapshot.clone())
    }

    pub(crate) fn take_steers(&self) -> Vec<crate::SteerRequest> {
        self.worker
            .records
            .lock()
            .ok()
            .and_then(|mut records| {
                records
                    .get_mut(&self.id)
                    .map(|record| record.steers.drain(..).collect())
            })
            .unwrap_or_default()
    }

    pub(crate) fn has_steers(&self) -> bool {
        self.worker
            .records
            .lock()
            .ok()
            .and_then(|records| {
                records
                    .get(&self.id)
                    .map(|record| !record.steers.is_empty())
            })
            .unwrap_or(false)
    }

    pub(crate) fn publish_response(&self, content: String) -> bool {
        let Ok(mut records) = self.worker.records.lock() else {
            return false;
        };
        let Some(root) = records.get(&self.id) else {
            return false;
        };
        if !root.steers.is_empty() || self.cancellation.is_cancelled() {
            return false;
        }
        let active_id = root.active_id.clone();
        let Some(record) = records.get_mut(&active_id) else {
            return false;
        };
        let snapshot = &mut record.snapshot;
        snapshot.status = "completed".into();
        snapshot.phase = "finalizing".into();
        snapshot.content = Some(content);
        snapshot.retry_after_ms = None;
        snapshot.next_model = None;
        snapshot.grounding.duration_ms =
            Some(now_ms().saturating_sub(snapshot.grounding.started_at_ms));
        true
    }

    pub(crate) fn close_steering(&self) {
        if let Ok(mut records) = self.worker.records.lock() {
            if let Some(root) = records.get_mut(&self.id) {
                root.accepts_steering = false;
            }
        }
    }

    pub(crate) fn grounding_tool_count(&self) -> usize {
        self.snapshot()
            .map_or(0, |snapshot| snapshot.grounding.tools.len())
    }

    pub(crate) fn report_error(&self, error: &ProviderError) {
        let Some(snapshot) = self.snapshot() else {
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
            let active_id = records.get(&self.id).map(|record| record.active_id.clone());
            if let Some(record) = active_id.and_then(|id| records.get_mut(&id)) {
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
        if let Ok(mut records) = self.worker.records.lock() {
            for record in records
                .values_mut()
                .filter(|record| record.steering_root == self.id)
            {
                if let Some(tool) = record
                    .snapshot
                    .grounding
                    .tools
                    .iter_mut()
                    .find(|tool| tool.id == id)
                {
                    tool.content = content.clone();
                    tool.ended_at_ms = Some(now_ms());
                }
            }
        }
    }
    pub(crate) fn parse_control(&self) -> squigit_harness::parser::ParseControl {
        let worker = self.worker.clone();
        let id = self.id.clone();
        let cancellation = self.cancellation.clone();
        let parser_cancellation = self.cancellation.clone();
        squigit_harness::parser::ParseControl::with_progress(move |text| {
            if cancellation.is_cancelled() {
                return;
            }
            if let Ok(mut records) = worker.records.lock() {
                if let Some(record) = records.get_mut(&id) {
                    let active_id = record.active_id.clone();
                    if let Some(record) = records.get_mut(&active_id) {
                        if !record.snapshot.is_terminal() {
                            record.snapshot.phase = "parsing".into();
                            record.snapshot.target = Some(text);
                        }
                    }
                }
            }
        })
        .with_cancellation(move || parser_cancellation.is_cancelled())
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
        self.close_steering();
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
        if self
            .snapshot()
            .is_some_and(|snapshot| !snapshot.is_terminal())
        {
            self.worker.cancel(&self.id);
        }
    }
}
