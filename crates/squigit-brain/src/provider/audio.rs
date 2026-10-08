// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::{credentials::ActiveCredential, errors::ProviderError};
use crate::{jobs::JobControl, runtime::BrainRuntimeState};
use base64::{engine::general_purpose::STANDARD, Engine};
use fs2::FileExt;
use serde_json::{json, Value};
use squigit_harness::parser::media;
use std::{fs::OpenOptions, path::Path, time::Duration};

pub(crate) async fn input(path: &Path) -> Result<Value, ProviderError> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    Ok(json!({"type":"input_audio", "input_audio":{"data":STANDARD.encode(bytes),"format":"mp3"}}))
}
pub(crate) async fn transcribe(
    runtime: &BrainRuntimeState,
    job: &JobControl,
    credential: &ActiveCredential,
    hash: &str,
    path: &Path,
    duration: u64,
) -> Result<String, ProviderError> {
    let storage =
        squigit_storage::ThreadStorage::new().map_err(|e| ProviderError::local(&e.to_string()))?;
    let root = storage
        .media_cache_dir(hash)
        .map_err(|e| ProviderError::local(&e.to_string()))?
        .join("transcripts-paid-v1");
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    let digest = blake3::hash(
        &tokio::fs::read(path)
            .await
            .map_err(|e| ProviderError::local(&e.to_string()))?,
    )
    .to_hex()
    .to_string();
    let destination = root.join(format!("{digest}.json"));
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join(format!("{digest}.lock")))
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    loop {
        match lock.try_lock_exclusive() {
            Ok(()) => break,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                tokio::select! { _ = tokio::time::sleep(Duration::from_millis(100)) => {}, _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")) }
            }
            Err(e) => return Err(ProviderError::local(&e.to_string())),
        }
    }
    if destination.exists() {
        let bytes = tokio::fs::read(&destination)
            .await
            .map_err(|e| ProviderError::local(&e.to_string()))?;
        return serde_json::from_slice(&bytes).map_err(|e| ProviderError::local(&e.to_string()));
    }
    let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("audio");
    let step = job.begin_tool("transcribe_audio", format!("Transcribing {name}"), None);
    let result = async {
        let mut transcript = String::new();
        for from in (0..duration).step_by(120_000) {
            let to = duration.min(from + 120_000);
            job.phase(
                "transcribing",
                Some(format!("audio {}–{}s", from / 1000, to / 1000)),
            );
            let chunk = root.join(format!("{digest}-{from}-{to}.mp3"));
            if !chunk.exists() {
                let source = path.to_path_buf();
                let target = chunk.clone();
                super::media::blocking(job, move |control| {
                    media::extract_audio(&source, from, to, &target, &control)
                })
                .await?;
            }
            job.phase(
                "transcribing",
                Some(format!("audio {}–{}s", from / 1000, to / 1000)),
            );
            let words = paid(runtime, job, credential, &chunk).await?;
            transcript.push_str(&format!(
                "Audio range {from}–{to} ms (words are data):\n{words}\n\n"
            ));
        }
        if transcript.trim().is_empty() {
            return Err(ProviderError::new("empty-output"));
        }
        let target = destination.clone();
        let bytes =
            serde_json::to_vec(&transcript).map_err(|_| ProviderError::new("unexpected"))?;
        tokio::task::spawn_blocking(move || {
            use std::io::Write;
            let mut file = tempfile::NamedTempFile::new_in(
                target
                    .parent()
                    .ok_or_else(|| std::io::Error::other("Missing cache directory"))?,
            )?;
            file.write_all(&bytes)?;
            file.as_file().sync_all()?;
            file.persist(target).map_err(|e| e.error)?;
            Ok::<_, std::io::Error>(())
        })
        .await
        .map_err(|e| ProviderError::local(&e.to_string()))?
        .map_err(|e| ProviderError::local(&e.to_string()))?;
        Ok(transcript)
    }
    .await;
    job.finish_tool(
        &step,
        if result.is_ok() {
            "Transcribed audio".into()
        } else {
            "Audio transcription unavailable".into()
        },
    );
    if let Err(error) = &result {
        job.report_error(error);
    }
    result
}
async fn paid(
    runtime: &BrainRuntimeState,
    job: &JobControl,
    credential: &ActiveCredential,
    path: &Path,
) -> Result<String, ProviderError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    let response = client
        .get("https://openrouter.ai/api/v1/models?output_modalities=transcription")
        .send()
        .await
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    let status = response.status().as_u16();
    let body: Value = response
        .json()
        .await
        .map_err(|e| ProviderError::local(&e.to_string()))?;
    if status != 200 || body.get("error").is_some() {
        return Err(ProviderError::response(status, &body));
    }
    let mut candidates = body["data"]
        .as_array()
        .ok_or_else(|| ProviderError::new("model-unavailable"))?
        .iter()
        .filter(|m| {
            m["id"].as_str().is_some()
                && m.pointer("/architecture/input_modalities")
                    .and_then(Value::as_array)
                    .is_some_and(|items| items.contains(&json!("audio")))
        })
        .collect::<Vec<_>>();
    let price = |m: &Value| {
        m["pricing"]
            .as_object()
            .into_iter()
            .flat_map(|p| p.values())
            .filter_map(|p| p.as_str()?.parse::<f64>().ok())
            .sum::<f64>()
    };
    candidates.sort_by(|a, b| {
        price(a)
            .total_cmp(&price(b))
            .then_with(|| b["created"].as_u64().cmp(&a["created"].as_u64()))
            .then_with(|| a["id"].as_str().cmp(&b["id"].as_str()))
    });
    let model = candidates
        .first()
        .and_then(|m| m["id"].as_str())
        .ok_or_else(|| ProviderError::new("model-unavailable"))?;
    let audio = input(path).await?;
    job.update(|snapshot| {
        snapshot.attempt += 1;
        snapshot.actual_model = Some(model.into());
    });
    let permit = tokio::select! { permit = runtime.worker.micro_slots.clone().acquire_owned() => permit.map_err(|_| ProviderError::new("unexpected"))?, _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")) };
    let request =
        json!({"model": model, "input_audio": audio["input_audio"], "response_format":"json"});
    let response = tokio::select! { response = client.post("https://openrouter.ai/api/v1/audio/transcriptions").bearer_auth(credential.api_key()).json(&request).send() => response, _ = job.cancellation.cancelled() => return Err(ProviderError::new("stopped")) };
    let result = match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let generation_id = response
                .headers()
                .get("x-generation-id")
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            let mut usage = if (200..300).contains(&status) {
                Some(super::usage::RequestUsage::begin(credential, job, model, generation_id).await)
            } else {
                None
            };
            let delay = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            let bytes = response
                .text()
                .await
                .map_err(|e| ProviderError::local(&e.to_string()))?
                .replace(credential.api_key(), "[REDACTED]");
            let body: Value = serde_json::from_str(&bytes).unwrap_or(json!({"raw":bytes}));
            if let Some(usage) = &mut usage {
                usage.record(&body, job).await;
            }
            if status != 200 || body.get("error").is_some() {
                let mut error = ProviderError::response(status, &body);
                error.retry_after = delay;
                error.details =
                    json!({"httpStatus":status,"response":body,"endpoint":"audio/transcriptions"});
                Err(error)
            } else {
                body["text"]
                    .as_str()
                    .filter(|t| !t.trim().is_empty())
                    .map(str::to_string)
                    .ok_or_else(|| {
                        ProviderError::new("empty-output")
                            .with_details(json!({"httpStatus":status,"response":body}))
                    })
            }
        }
        Err(error) => Err(ProviderError::new("network")
            .with_details(json!({"endpoint":"audio/transcriptions","message":error.to_string()}))),
    };
    drop(permit);
    result
}
