// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::{credentials::ActiveCredential, errors::ProviderError};
use crate::jobs::JobControl;
use serde_json::Value;
use squigit_storage::{UsageRequest, UsageStore};

pub(crate) struct RequestUsage {
    store: Option<UsageStore>,
    request: UsageRequest,
}

impl RequestUsage {
    pub(crate) async fn begin(
        credential: &ActiveCredential,
        job: &JobControl,
        model: &str,
        generation_id: Option<String>,
    ) -> Self {
        let snapshot = job.snapshot();
        let request = UsageRequest {
            id: crate::jobs::new_job_id(),
            generation_id,
            profile_id: credential.profile_id.clone(),
            conversation_id: snapshot
                .as_ref()
                .map(|snapshot| snapshot.thread_id.clone())
                .unwrap_or_default(),
            task: snapshot
                .as_ref()
                .map(|snapshot| snapshot.task.clone())
                .unwrap_or_default(),
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            model: model.into(),
            cost_usd: None,
        };
        let initial = request.clone();
        let store = match tokio::task::spawn_blocking(move || {
            let store = UsageStore::new()?;
            store.record_request(&initial)?;
            Ok::<_, squigit_storage::StorageError>(store)
        })
        .await
        {
            Ok(Ok(store)) => Some(store),
            Ok(Err(error)) => {
                report(job, &error.to_string());
                None
            }
            Err(error) => {
                report(job, &error.to_string());
                None
            }
        };
        Self { store, request }
    }

    pub(crate) async fn record(&mut self, response: &Value, job: &JobControl) {
        let Some(store) = self.store.clone() else {
            return;
        };
        let model = response["model"]
            .as_str()
            .unwrap_or(&self.request.model)
            .to_string();
        let generation_id = response["id"]
            .as_str()
            .map(str::to_string)
            .or_else(|| self.request.generation_id.clone());
        let cost = response
            .pointer("/usage/cost")
            .and_then(|value| value.as_f64().or_else(|| value.as_str()?.parse().ok()))
            .filter(|cost| cost.is_finite() && *cost >= 0.0)
            .or(self.request.cost_usd);
        if model == self.request.model
            && generation_id == self.request.generation_id
            && cost == self.request.cost_usd
        {
            return;
        }
        self.request.model = model;
        self.request.generation_id = generation_id;
        self.request.cost_usd = cost;
        let request = self.request.clone();
        match tokio::task::spawn_blocking(move || store.record_request(&request)).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => report(job, &error.to_string()),
            Err(error) => report(job, &error.to_string()),
        }
    }
}

pub(crate) async fn tool(credential: &ActiveCredential, job: &JobControl, name: &str, calls: u32) {
    if calls == 0 {
        return;
    }
    let profile = credential.profile_id.clone();
    let conversation = job
        .snapshot()
        .map(|snapshot| snapshot.thread_id)
        .unwrap_or_default();
    let name = name.to_string();
    match tokio::task::spawn_blocking(move || {
        UsageStore::new()?.record_tool(&profile, &conversation, &name, calls)
    })
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => report(job, &error.to_string()),
        Err(error) => report(job, &error.to_string()),
    }
}

fn report(job: &JobControl, message: &str) {
    job.report_error(&ProviderError::local(message));
}
