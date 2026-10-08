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
        let unbriefed = match object.file_context.file_type {
            squigit_storage::AttachmentFileType::Image => object.file_context.file_brief.is_none(),
            squigit_storage::AttachmentFileType::Document
            | squigit_storage::AttachmentFileType::Video => {
                squigit_harness::parser::media::load_index(&entry.attachment_hash)
                    .ok()
                    .flatten()
                    .is_some_and(|index| {
                        squigit_harness::parser::media::collage_paths(&index)
                            .iter()
                            .any(|image| {
                                squigit_harness::parser::media::load_brief(image)
                                    .ok()
                                    .flatten()
                                    .is_none()
                            })
                    })
            }
            squigit_storage::AttachmentFileType::Audio => false,
        };
        if unbriefed {
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

struct BriefTarget {
    id: String,
    source_hash: String,
    path: std::path::PathBuf,
    metadata: Value,
    collage: bool,
}
fn publish_brief(storage: &ThreadStorage, hash: &str) -> Result<(), ProviderError> {
    let Some(index) = squigit_harness::parser::media::load_index(hash)
        .map_err(|e| ProviderError::local(&e.to_string()))?
    else {
        return Ok(());
    };
    let mut briefs = Vec::new();
    for output in index.selections {
        for image in output.manifest.images {
            if let Some(brief) =
                squigit_harness::parser::media::load_brief(&output.output_dir.join(image.file))
                    .map_err(|e| ProviderError::local(&e.to_string()))?
            {
                let range = match (image.tiles.first(), image.tiles.last()) {
                    (Some(first), Some(last)) => format!("{}-{}", first.label, last.label),
                    _ => String::new(),
                };
                briefs.push(format!("{range}: {brief}"));
            }
        }
    }
    if !briefs.is_empty() {
        let _lock = storage
            .lock_object_manifest(hash)
            .map_err(|e| ProviderError::local(&e.to_string()))?;
        let mut object = storage
            .load_object_manifest(hash)
            .map_err(|e| ProviderError::local(&e.to_string()))?;
        object.file_context.file_brief = Some(briefs.join("\n"));
        storage
            .save_object_manifest(hash, &object)
            .map_err(|e| ProviderError::local(&e.to_string()))?;
    }
    Ok(())
}

async fn run(
    runtime: &BrainRuntimeState,
    job: &JobControl,
    credential: &ActiveCredential,
    thread_id: &str,
    entries: Vec<AttachmentManifestEntry>,
    selected_model: &str,
) -> Result<String, ProviderError> {
    let storage = ThreadStorage::new().map_err(|e| ProviderError::local(&e.to_string()))?;
    let mut targets = Vec::new();
    for entry in &entries {
        if entry.file_type == squigit_storage::AttachmentFileType::Image {
            let path = storage
                .find_object_blob(&entry.attachment_hash)
                .map_err(|e| ProviderError::local(&e.to_string()))?;
            targets.push(BriefTarget {
                id: entry.attachment_hash.clone(),
                source_hash: entry.attachment_hash.clone(),
                path,
                metadata: json!({"display_name":entry.display_name}),
                collage: false,
            });
        } else if let Some(index) =
            squigit_harness::parser::media::load_index(&entry.attachment_hash)
                .map_err(|e| ProviderError::local(&e.to_string()))?
        {
            for output in &index.selections {
                let text = if let Some(file) = &output.manifest.text {
                    tokio::fs::read_to_string(output.output_dir.join(file))
                        .await
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                for image in &output.manifest.images {
                    let path = output.output_dir.join(&image.file);
                    if squigit_harness::parser::media::load_brief(&path)
                        .map_err(|e| ProviderError::local(&e.to_string()))?
                        .is_some()
                    {
                        continue;
                    }
                    let labels = image
                        .tiles
                        .iter()
                        .map(|tile| &tile.label)
                        .collect::<Vec<_>>();
                    let page_text = image
                        .tiles
                        .iter()
                        .filter_map(|tile| tile.page)
                        .filter_map(|page| {
                            let marker = format!("--- Page {page} ---\n");
                            let content = text.split_once(&marker)?.1;
                            Some(
                                content
                                    .split("--- Page ")
                                    .next()
                                    .unwrap_or(content)
                                    .chars()
                                    .take(6000)
                                    .collect::<String>(),
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n");
                    targets.push(BriefTarget { id: blake3::hash(path.to_string_lossy().as_bytes()).to_hex().to_string(), source_hash: entry.attachment_hash.clone(), path, metadata: json!({"display_name":entry.display_name,"range":labels,"best_effort_text":page_text}), collage: true });
                }
            }
        }
    }
    let selection = super::models::ModelSelection::parse(selected_model)
        .map_err(|e| ProviderError::local(&e))?;
    let candidates = super::models::job_candidates(&selection, true, false, None).await?;
    let config: Value = serde_yaml::from_str(include_str!("../assets/helpers/summarize_files.yml"))
        .map_err(|_| ProviderError::new("unexpected"))?;
    for batch in targets.chunks(12) {
        let mut content = Vec::new();
        for target in batch {
            content.push(transport::text(
                json!({"attachment_id":target.id,"metadata":target.metadata}).to_string(),
            ));
            content.push(
                super::images::from_path(&target.path.to_string_lossy())
                    .await
                    .map_err(|e| ProviderError::local(&e))?,
            );
        }
        let raw = transport::execute(runtime, job, credential, &candidates, RequestSpec {
            input:vec![json!({"role":"user","content":content})],
            system_instruction:config["summarize_files"].as_str().ok_or_else(|| ProviderError::new("unexpected"))?.into(),
            tools:Vec::new(), effort:None, free:selection.is_free(), utility:true, force_web_search:false, message_id:None,
            schema:Some(json!({"type":"object","properties":{"files":{"type":"array","items":{"type":"object","properties":{"attachment_id":{"type":"string"},"brief":{"type":"string"}},"required":["attachment_id","brief"],"additionalProperties":false}}},"required":["files"],"additionalProperties":false})),
        },None).await?;
        let invalid = || ProviderError::new("invalid-output").with_details(json!({"output":raw}));
        let payload: Value = serde_json::from_str(&raw).map_err(|_| invalid())?;
        let files = payload["files"].as_array().ok_or_else(invalid)?;
        let expected = batch
            .iter()
            .map(|target| target.id.as_str())
            .collect::<HashSet<_>>();
        let mut returned = HashSet::new();
        for file in files {
            let id = file["attachment_id"].as_str().ok_or_else(invalid)?;
            let brief = file["brief"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(invalid)?;
            if !expected.contains(id) || !returned.insert(id) || brief.len() > 16000 {
                return Err(invalid());
            }
        }
        if returned != expected {
            return Err(invalid());
        }
        for target in batch {
            if job.cancellation.is_cancelled() {
                return Err(ProviderError::new("stopped"));
            }
            let brief = files
                .iter()
                .find(|file| file["attachment_id"].as_str() == Some(&target.id))
                .and_then(|file| file["brief"].as_str())
                .ok_or_else(invalid)?
                .trim()
                .to_string();
            let path = target.path.clone();
            let hash = target.source_hash.clone();
            let collage = target.collage;
            tokio::task::spawn_blocking(move || {
                if collage {
                    return squigit_harness::parser::media::save_brief(&path, &brief)
                        .map_err(|e| e.to_string());
                }
                let storage = ThreadStorage::new().map_err(|e| e.to_string())?;
                let _guard = storage
                    .lock_object_manifest(&hash)
                    .map_err(|e| e.to_string())?;
                let mut object = storage
                    .load_object_manifest(&hash)
                    .map_err(|e| e.to_string())?;
                if object.file_context.file_brief.is_none() {
                    object.file_context.file_brief = Some(brief);
                    storage
                        .save_object_manifest(&hash, &object)
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            })
            .await
            .map_err(|e| ProviderError::local(&e.to_string()))?
            .map_err(|e| ProviderError::local(&e))?;
        }
        for hash in batch
            .iter()
            .map(|target| target.source_hash.as_str())
            .collect::<HashSet<_>>()
        {
            publish_brief(&storage, hash)?;
        }
        storage
            .refresh_attachment_briefs(thread_id)
            .map_err(|e| ProviderError::local(&e.to_string()))?;
    }
    for entry in &entries {
        publish_brief(&storage, &entry.attachment_hash)?;
    }
    storage
        .refresh_attachment_briefs(thread_id)
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    Ok("File and collage briefs generated".into())
}
