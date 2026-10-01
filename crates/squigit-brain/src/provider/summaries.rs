// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::credentials::ActiveCredential;
use super::errors::ProviderError;
use super::transport::{self, RequestSpec};
use crate::jobs::{new_job_id, JobControl};
use crate::runtime::BrainRuntimeState;
use serde_json::{json, Value};
use squigit_storage::{AttachmentManifestEntry, ThreadStorage};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

struct SummaryClaim {
    inflight: Arc<Mutex<HashMap<String, HashSet<String>>>>,
    keys: Vec<String>,
}

impl Drop for SummaryClaim {
    fn drop(&mut self) {
        let mut subscribers = HashSet::new();
        if let Ok(mut inflight) = self.inflight.lock() {
            for key in &self.keys {
                if let Some(threads) = inflight.remove(key) {
                    subscribers.extend(threads);
                }
            }
        }
        if let Ok(storage) = ThreadStorage::new() {
            for thread_id in subscribers {
                let _ = storage.refresh_attachment_briefs(&thread_id);
            }
        }
    }
}

pub(crate) fn start(
    runtime: &BrainRuntimeState,
    credential: ActiveCredential,
    thread_id: String,
    manifest: Vec<AttachmentManifestEntry>,
    selected_model: String,
) {
    let Ok(storage) = ThreadStorage::new() else {
        return;
    };
    let mut selected = Vec::new();
    let mut keys = Vec::new();
    let Ok(mut inflight) = runtime.summary_inflight.lock() else {
        return;
    };
    for entry in manifest {
        let Ok(object) = storage.load_object_manifest(&entry.attachment_hash) else {
            continue;
        };
        let key = format!(
            "{}:{}",
            storage.objects_dir().display(),
            entry.attachment_hash
        );
        if object.file_context.file_type == squigit_storage::AttachmentFileType::Image
            && object.file_context.file_brief.is_none()
        {
            match inflight.entry(key.clone()) {
                std::collections::hash_map::Entry::Occupied(mut claim) => {
                    claim.get_mut().insert(thread_id.clone());
                }
                std::collections::hash_map::Entry::Vacant(claim) => {
                    claim.insert(HashSet::from([thread_id.clone()]));
                    keys.push(key);
                    selected.push(entry);
                }
            }
        }
    }
    drop(inflight);
    if selected.is_empty() {
        let _ = storage.refresh_attachment_briefs(&thread_id);
        return;
    }
    let claim = SummaryClaim {
        inflight: runtime.summary_inflight.clone(),
        keys,
    };
    let Ok(job) = runtime
        .worker
        .register(new_job_id(), thread_id.clone(), "summarize_files")
    else {
        return;
    };
    let runtime = runtime.clone();
    tokio::spawn(async move {
        let _claim = claim;
        let result = tokio::select! {
            result = run(&runtime, &job, &credential, &thread_id, selected, &selected_model) => result,
            _ = job.cancellation.cancelled() => Err(ProviderError::new("stopped")),
        };
        job.finish(result);
    });
}

async fn run(
    runtime: &BrainRuntimeState,
    job: &JobControl,
    credential: &ActiveCredential,
    thread_id: &str,
    entries: Vec<AttachmentManifestEntry>,
    selected_model: &str,
) -> Result<String, ProviderError> {
    let storage = ThreadStorage::new().map_err(|error| ProviderError::local(&error.to_string()))?;
    let mut content = Vec::new();
    for entry in &entries {
        content.push(transport::text(
            json!({"attachment_id":entry.attachment_hash,"display_name":entry.display_name})
                .to_string(),
        ));
        content.push(
            super::images::from_hash(&entry.attachment_hash)
                .await
                .map_err(|error| ProviderError::local(&error))?,
        );
    }
    let selection = super::models::ModelSelection::parse(selected_model)
        .map_err(|error| ProviderError::local(&error))?;
    let candidates = super::models::job_candidates(&selection, true, false, None).await?;
    let config: Value = serde_yaml::from_str(include_str!("../assets/helpers/summarize_files.yml"))
        .map_err(|_| ProviderError::new("unexpected"))?;
    let raw = transport::execute(runtime, job, credential, &candidates, RequestSpec {
        input:vec![json!({"role":"user","content":content})],
        system_instruction:config["summarize_files"].as_str().ok_or_else(|| ProviderError::new("unexpected"))?.to_string(),
        tools:Vec::new(), effort:None, free:selection.is_free(),
        schema:Some(json!({"type":"object","properties":{"files":{"type":"array","items":{"type":"object","properties":{"attachment_id":{"type":"string"},"brief":{"type":"string"}},"required":["attachment_id","brief"],"additionalProperties":false}}},"required":["files"],"additionalProperties":false})),
    },None).await?;
    let invalid = || ProviderError::new("invalid-output").with_details(json!({"output":raw}));
    let payload: Value = serde_json::from_str(&raw).map_err(|_| invalid())?;
    let files = payload["files"].as_array().ok_or_else(invalid)?;
    let expected = entries
        .iter()
        .map(|entry| entry.attachment_hash.as_str())
        .collect::<HashSet<_>>();
    let mut returned = HashSet::new();
    for file in files {
        let id = file["attachment_id"].as_str().ok_or_else(invalid)?;
        let brief = file["brief"]
            .as_str()
            .filter(|brief| !brief.trim().is_empty())
            .ok_or_else(invalid)?;
        if !expected.contains(id) || !returned.insert(id) || brief.len() > 16_000 {
            return Err(invalid());
        }
    }
    if returned != expected {
        return Err(invalid());
    }
    for file in files {
        if job.cancellation.is_cancelled() {
            return Err(ProviderError::new("stopped"));
        }
        let hash = file["attachment_id"]
            .as_str()
            .ok_or_else(|| ProviderError::new("unexpected"))?
            .to_string();
        let brief = file["brief"]
            .as_str()
            .ok_or_else(|| ProviderError::new("unexpected"))?
            .trim()
            .to_string();
        tokio::task::spawn_blocking(move || {
            let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
            let _guard = storage
                .lock_object_manifest(&hash)
                .map_err(|error| error.to_string())?;
            let mut manifest = storage
                .load_object_manifest(&hash)
                .map_err(|error| error.to_string())?;
            if manifest.file_context.file_brief.is_none() {
                manifest.file_context.file_brief = Some(brief);
                storage
                    .save_object_manifest(&hash, &manifest)
                    .map_err(|error| error.to_string())?;
            }
            Ok::<_, String>(())
        })
        .await
        .map_err(|_| ProviderError::new("unexpected"))?
        .map_err(|error| ProviderError::local(&error))?;
    }
    storage
        .refresh_attachment_briefs(thread_id)
        .map_err(|error| ProviderError::local(&error.to_string()))?;
    Ok(raw)
}
