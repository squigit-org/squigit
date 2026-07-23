// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose, Engine as _};
use futures_util::future::join_all;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use squigit_storage::{AttachmentFileType, ThreadStorage};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use crate::runtime::BrainRuntimeState;

use super::cache::{
    ensure_file_uploaded_for_identity, load_active_key_identity, ActiveKeyIdentity, EnsuredFile,
};
use super::GeminiFileRef;

const PREFLIGHT_LEASE_TTL: Duration = Duration::from_secs(60);
const CONNECTIVITY_RETRY_DELAY: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentPreparationStatus {
    Pending,
    Ready,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttachmentPreparationError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareAttachmentRequest {
    pub job_id: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareAttachmentResult {
    pub job_id: String,
    pub attachment_hash: Option<String>,
    pub cas_path: Option<String>,
    pub file_type: Option<AttachmentFileType>,
    pub status: AttachmentPreparationStatus,
    pub disposition: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareSubmissionAttachmentsRequest {
    pub preflight_id: String,
    pub thread_id: String,
    pub user_message_id: String,
    pub attachment_hashes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionAttachmentResult {
    pub attachment_hash: String,
    pub file_type: Option<AttachmentFileType>,
    pub status: AttachmentPreparationStatus,
    pub disposition: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareSubmissionAttachmentsResult {
    pub preflight_token: Option<String>,
    pub results: Vec<SubmissionAttachmentResult>,
}

#[derive(Clone)]
pub(crate) struct AttachmentPreparationJob {
    pub(crate) cancellation: CancellationToken,
    pub(crate) work_key: Option<String>,
}

#[derive(Clone)]
pub(crate) struct SharedAttachmentWork {
    pub(crate) cancellation: CancellationToken,
    pub(crate) subscribers: HashSet<String>,
    pub(crate) result: watch::Receiver<Option<Result<EnsuredFile, String>>>,
}

#[derive(Clone)]
pub(crate) struct AttachmentPreflightLease {
    pub(crate) expires_at: Instant,
    pub(crate) thread_id: String,
    pub(crate) user_message_id: String,
    pub(crate) attachment_hashes: Vec<String>,
    pub(crate) key_fingerprint: String,
    pub(crate) api_key: String,
    pub(crate) files_by_hash: HashMap<String, GeminiFileRef>,
}

#[derive(Debug, Clone)]
pub(crate) struct ConsumedAttachmentPreflight {
    pub(crate) api_key: String,
    pub(crate) files_by_hash: HashMap<String, GeminiFileRef>,
}

fn preparation_error(error: impl Into<String>) -> AttachmentPreparationError {
    let message = error.into();
    let lower = message.to_ascii_lowercase();
    AttachmentPreparationError {
        code: if message == "CANCELLED" {
            "cancelled"
        } else if lower.contains("profile") || lower.contains("key") {
            "credential_unavailable"
        } else if lower.contains("upload") || lower.contains("gemini") {
            "remote_preparation_failed"
        } else {
            "attachment_preparation_failed"
        }
        .to_string(),
        retryable: message != "CANCELLED",
        message,
    }
}

fn is_transient_remote_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.starts_with("transient:")
        || lower.contains("temporarily failed")
        || lower.contains("timed out")
        || lower.contains("connection")
}

fn cancelled_prepare_result(
    job_id: String,
    hash: Option<String>,
    path: Option<String>,
    file_type: Option<AttachmentFileType>,
) -> PrepareAttachmentResult {
    let error = preparation_error("CANCELLED");
    PrepareAttachmentResult {
        job_id,
        attachment_hash: hash,
        cas_path: path,
        file_type,
        status: AttachmentPreparationStatus::Cancelled,
        disposition: None,
        error_code: Some(error.code),
        error_message: Some(error.message),
    }
}

fn normalized_hashes(hashes: &[String]) -> Vec<String> {
    let mut normalized = hashes
        .iter()
        .map(|hash| hash.trim().to_ascii_lowercase())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

enum InspectedAttachmentSource {
    Existing {
        hash: String,
        cas_path: std::path::PathBuf,
    },
    Raw {
        hash: String,
        bytes: Vec<u8>,
        extension: String,
    },
}

fn inspect_attachment_source(source_path: &str) -> Result<InspectedAttachmentSource, String> {
    if let Ok(resolved) = super::paths::resolve_attachment_path_internal(source_path) {
        let hash = resolved
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "CAS attachment has no object hash".to_string())?
            .to_ascii_lowercase();
        return Ok(InspectedAttachmentSource::Existing {
            hash,
            cas_path: resolved,
        });
    }

    let raw_path = source_path.strip_prefix("file://").unwrap_or(source_path);
    let resolved = Path::new(raw_path)
        .canonicalize()
        .map_err(|error| format!("Attachment source path is unavailable: {error}"))?;
    let bytes = std::fs::read(&resolved).map_err(|error| error.to_string())?;
    let hash = blake3::hash(&bytes).to_hex().to_string();
    let extension = resolved
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    Ok(InspectedAttachmentSource::Raw {
        hash,
        bytes,
        extension,
    })
}

fn commit_attachment_source(
    source: InspectedAttachmentSource,
) -> Result<(String, String, AttachmentFileType), String> {
    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    let (hash, cas_path) = match source {
        InspectedAttachmentSource::Existing { hash, cas_path } => (hash, cas_path),
        InspectedAttachmentSource::Raw {
            hash,
            bytes,
            extension,
        } => {
            let staged = storage
                .store_file(&bytes, &extension, None)
                .map_err(|error| error.to_string())?;
            if staged.hash != hash {
                return Err("Attachment content changed while staging".to_string());
            }
            (hash, Path::new(&staged.path).to_path_buf())
        }
    };
    let manifest = storage
        .load_object_manifest(&hash)
        .map_err(|error| error.to_string())?;
    Ok((
        hash,
        cas_path.to_string_lossy().to_string(),
        manifest.file_context.file_type,
    ))
}

async fn stage_attachment(
    runtime: &BrainRuntimeState,
    source_path: String,
    cancellation: &CancellationToken,
) -> Result<(String, String, AttachmentFileType), String> {
    let inspected = tokio::select! {
        result = tokio::task::spawn_blocking(move || inspect_attachment_source(&source_path)) => {
            result
                .map_err(|error| format!("Attachment staging task failed: {error}"))??
        }
        _ = cancellation.cancelled() => return Err("CANCELLED".to_string()),
    };
    let hash = match &inspected {
        InspectedAttachmentSource::Existing { hash, .. }
        | InspectedAttachmentSource::Raw { hash, .. } => hash.clone(),
    };
    let object_lock = runtime.object_manifest_lock(&hash).await;
    let _guard = tokio::select! {
        guard = object_lock.lock() => guard,
        _ = cancellation.cancelled() => return Err("CANCELLED".to_string()),
    };
    let committed = tokio::task::spawn_blocking(move || commit_attachment_source(inspected))
        .await
        .map_err(|error| format!("Attachment staging task failed: {error}"))?;
    if cancellation.is_cancelled() {
        Err("CANCELLED".to_string())
    } else {
        committed
    }
}

async fn register_job(
    runtime: &BrainRuntimeState,
    job_id: &str,
) -> Result<CancellationToken, String> {
    if job_id.trim().is_empty() {
        return Err("Attachment preparation job ID cannot be empty".to_string());
    }
    let cancellation = CancellationToken::new();
    let mut jobs = runtime.attachment_jobs.lock().await;
    if jobs.contains_key(job_id) {
        return Err(format!(
            "Attachment preparation job already exists: {job_id}"
        ));
    }
    jobs.insert(
        job_id.to_string(),
        AttachmentPreparationJob {
            cancellation: cancellation.clone(),
            work_key: None,
        },
    );
    Ok(cancellation)
}

async fn detach_job_from_work(runtime: &BrainRuntimeState, job_id: &str, work_key: &str) {
    let mut work = runtime.attachment_work.lock().await;
    let should_remove = if let Some(shared) = work.get_mut(work_key) {
        shared.subscribers.remove(job_id);
        if shared.subscribers.is_empty() {
            shared.cancellation.cancel();
            true
        } else {
            false
        }
    } else {
        false
    };
    if should_remove {
        work.remove(work_key);
    }
    if let Some(job) = runtime.attachment_jobs.lock().await.get_mut(job_id) {
        if job.work_key.as_deref() == Some(work_key) {
            job.work_key = None;
        }
    }
}

async fn finish_job(runtime: &BrainRuntimeState, job_id: &str) {
    let job = runtime.attachment_jobs.lock().await.remove(job_id);
    if let Some(work_key) = job.and_then(|job| job.work_key) {
        detach_job_from_work(runtime, job_id, &work_key).await;
    }
}

async fn run_shared_upload(
    runtime: &BrainRuntimeState,
    job_id: &str,
    hash: &str,
    cas_path: &str,
    identity: ActiveKeyIdentity,
    job_cancel: &CancellationToken,
) -> Result<EnsuredFile, String> {
    let work_key = format!("{hash}:{}", identity.fingerprint);
    let mut receiver = {
        let mut work = runtime.attachment_work.lock().await;
        if let Some(shared) = work.get_mut(&work_key) {
            shared.subscribers.insert(job_id.to_string());
            shared.result.clone()
        } else {
            let cancellation = CancellationToken::new();
            let (sender, receiver) = watch::channel(None);
            let mut subscribers = HashSet::new();
            subscribers.insert(job_id.to_string());
            work.insert(
                work_key.clone(),
                SharedAttachmentWork {
                    cancellation: cancellation.clone(),
                    subscribers,
                    result: receiver.clone(),
                },
            );
            let runtime = runtime.clone();
            let cas_path = cas_path.to_string();
            tokio::spawn(async move {
                let result = ensure_file_uploaded_for_identity(
                    &runtime,
                    &identity,
                    &cas_path,
                    &cancellation,
                )
                .await;
                let _ = sender.send(Some(result));
            });
            receiver
        }
    };
    if let Some(job) = runtime.attachment_jobs.lock().await.get_mut(job_id) {
        job.work_key = Some(work_key.clone());
    }

    let result = loop {
        if let Some(result) = receiver.borrow().clone() {
            break result;
        }
        tokio::select! {
            changed = receiver.changed() => {
                if changed.is_err() && receiver.borrow().is_none() {
                    break Err("Attachment preparation work stopped unexpectedly".to_string());
                }
            }
            _ = job_cancel.cancelled() => break Err("CANCELLED".to_string()),
        }
    };
    detach_job_from_work(runtime, job_id, &work_key).await;
    result
}

pub(crate) async fn prepare_attachment(
    runtime: &BrainRuntimeState,
    request: PrepareAttachmentRequest,
) -> PrepareAttachmentResult {
    let job_id = request.job_id;
    let job_cancel = match register_job(runtime, &job_id).await {
        Ok(token) => token,
        Err(error) => {
            let error = preparation_error(error);
            return PrepareAttachmentResult {
                job_id,
                attachment_hash: None,
                cas_path: None,
                file_type: None,
                status: AttachmentPreparationStatus::Failed,
                disposition: None,
                error_code: Some(error.code),
                error_message: Some(error.message),
            };
        }
    };
    let staged = stage_attachment(runtime, request.source_path.clone(), &job_cancel).await;
    let (hash, cas_path, file_type) = match staged {
        Ok(value) => value,
        Err(error) => {
            finish_job(runtime, &job_id).await;
            let error = preparation_error(error);
            return PrepareAttachmentResult {
                job_id,
                attachment_hash: None,
                cas_path: None,
                file_type: None,
                status: AttachmentPreparationStatus::Failed,
                disposition: None,
                error_code: Some(error.code),
                error_message: Some(error.message),
            };
        }
    };
    if job_cancel.is_cancelled() {
        finish_job(runtime, &job_id).await;
        return cancelled_prepare_result(job_id, Some(hash), Some(cas_path), Some(file_type));
    }

    if file_type == AttachmentFileType::TextLocal {
        finish_job(runtime, &job_id).await;
        return PrepareAttachmentResult {
            job_id,
            attachment_hash: Some(hash),
            cas_path: Some(cas_path),
            file_type: Some(file_type),
            status: AttachmentPreparationStatus::Ready,
            disposition: Some("local_only".to_string()),
            error_code: None,
            error_message: None,
        };
    }

    let outcome = loop {
        if job_cancel.is_cancelled() {
            break Err("CANCELLED".to_string());
        }
        let identity = match load_active_key_identity() {
            Ok(identity) => identity,
            Err(error) => break Err(error),
        };
        let prepared = run_shared_upload(
            runtime,
            &job_id,
            &hash,
            &cas_path,
            identity.clone(),
            &job_cancel,
        )
        .await;
        let prepared = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                if error == "CANCELLED" {
                    break Err(error);
                }
                match load_active_key_identity() {
                    Ok(latest)
                        if latest.fingerprint != identity.fingerprint
                            || latest.encrypted_key_ref != identity.encrypted_key_ref =>
                    {
                        continue
                    }
                    Ok(_) => break Err(error),
                    Err(identity_error) => break Err(identity_error),
                }
            }
        };
        let latest = match load_active_key_identity() {
            Ok(identity) => identity,
            Err(error) => break Err(error),
        };
        if latest.fingerprint == identity.fingerprint
            && latest.encrypted_key_ref == identity.encrypted_key_ref
        {
            break Ok(prepared);
        }
    };
    finish_job(runtime, &job_id).await;

    match outcome {
        Ok(prepared) => PrepareAttachmentResult {
            job_id,
            attachment_hash: Some(hash),
            cas_path: Some(cas_path),
            file_type: Some(file_type),
            status: AttachmentPreparationStatus::Ready,
            disposition: Some(prepared.disposition.as_str().to_string()),
            error_code: None,
            error_message: None,
        },
        Err(error) if error == "CANCELLED" => {
            cancelled_prepare_result(job_id, Some(hash), Some(cas_path), Some(file_type))
        }
        Err(error) => {
            let error = preparation_error(error);
            PrepareAttachmentResult {
                job_id,
                attachment_hash: Some(hash),
                cas_path: Some(cas_path),
                file_type: Some(file_type),
                status: AttachmentPreparationStatus::Failed,
                disposition: None,
                error_code: Some(error.code),
                error_message: Some(error.message),
            }
        }
    }
}

pub(crate) async fn cancel_attachment(runtime: &BrainRuntimeState, job_id: &str) {
    let job = runtime.attachment_jobs.lock().await.remove(job_id);
    let Some(job) = job else {
        return;
    };
    job.cancellation.cancel();
    if let Some(work_key) = job.work_key {
        detach_job_from_work(runtime, job_id, &work_key).await;
    }
}

pub(crate) async fn cancel_all_attachment_jobs(runtime: &BrainRuntimeState) {
    let jobs = runtime
        .attachment_jobs
        .lock()
        .await
        .drain()
        .map(|(_, job)| job)
        .collect::<Vec<_>>();
    for job in jobs {
        job.cancellation.cancel();
    }
    let work = runtime
        .attachment_work
        .lock()
        .await
        .drain()
        .map(|(_, work)| work)
        .collect::<Vec<_>>();
    for work in work {
        work.cancellation.cancel();
    }
    cancel_preflight(runtime, None).await;
    runtime.attachment_preflight_leases.lock().await.clear();
}

async fn wait_for_connectivity(
    identity: &ActiveKeyIdentity,
    cancellation: &CancellationToken,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    loop {
        if load_active_key_identity()?.fingerprint != identity.fingerprint {
            return Err("KEY_CHANGED".to_string());
        }
        let response = tokio::select! {
            result = client
                .get(format!(
                    "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                    identity.api_key
                ))
                .send() => result,
            _ = cancellation.cancelled() => return Err("CANCELLED".to_string()),
        };
        match response {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) if !response.status().is_server_error() => {
                if load_active_key_identity()?.fingerprint != identity.fingerprint {
                    return Err("KEY_CHANGED".to_string());
                }
                return Err(format!(
                    "Gemini connectivity check failed ({})",
                    response.status()
                ));
            }
            Ok(_) | Err(_) => {
                if load_active_key_identity()?.fingerprint != identity.fingerprint {
                    return Err("KEY_CHANGED".to_string());
                }
                tokio::select! {
                    _ = tokio::time::sleep(CONNECTIVITY_RETRY_DELAY) => {}
                    _ = cancellation.cancelled() => return Err("CANCELLED".to_string()),
                }
            }
        }
    }
}

fn submission_failure(
    hash: String,
    file_type: Option<AttachmentFileType>,
    error: String,
) -> SubmissionAttachmentResult {
    let status = if error == "CANCELLED" {
        AttachmentPreparationStatus::Cancelled
    } else {
        AttachmentPreparationStatus::Failed
    };
    let error = preparation_error(error);
    SubmissionAttachmentResult {
        attachment_hash: hash,
        file_type,
        status,
        disposition: None,
        error_code: Some(error.code),
        error_message: Some(error.message),
    }
}

fn new_preflight_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    format!(
        "attachment_preflight_{}",
        general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    )
}

pub(crate) async fn prepare_submission_attachments(
    runtime: &BrainRuntimeState,
    request: PrepareSubmissionAttachmentsRequest,
) -> PrepareSubmissionAttachmentsResult {
    let cancellation = CancellationToken::new();
    {
        let mut preflights = runtime.attachment_preflights.lock().await;
        if preflights.contains_key(&request.preflight_id) {
            return PrepareSubmissionAttachmentsResult {
                preflight_token: None,
                results: request
                    .attachment_hashes
                    .into_iter()
                    .map(|hash| {
                        submission_failure(
                            hash,
                            None,
                            "Attachment preflight ID is already active".to_string(),
                        )
                    })
                    .collect(),
            };
        }
        preflights.insert(request.preflight_id.clone(), cancellation.clone());
    }

    let result = prepare_submission_attachments_inner(runtime, &request, &cancellation).await;
    runtime
        .attachment_preflights
        .lock()
        .await
        .remove(&request.preflight_id);
    result
}

async fn prepare_submission_attachments_inner(
    runtime: &BrainRuntimeState,
    request: &PrepareSubmissionAttachmentsRequest,
    cancellation: &CancellationToken,
) -> PrepareSubmissionAttachmentsResult {
    let fail_all = |error: String| PrepareSubmissionAttachmentsResult {
        results: request
            .attachment_hashes
            .iter()
            .cloned()
            .map(|hash| submission_failure(hash, None, error.clone()))
            .collect(),
        preflight_token: None,
    };
    if request
        .attachment_hashes
        .iter()
        .any(|hash| hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return fail_all("Preflight contains an invalid attachment hash".to_string());
    }

    loop {
        let identity = match load_active_key_identity() {
            Ok(identity) => identity,
            Err(error) => return fail_all(error),
        };
        if let Err(error) = wait_for_connectivity(&identity, cancellation).await {
            if error == "KEY_CHANGED" {
                continue;
            }
            return fail_all(error);
        }

        let futures = request.attachment_hashes.iter().map(|hash| {
            let identity = identity.clone();
            async move {
                let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
                let manifest = storage
                    .load_object_manifest(hash)
                    .map_err(|error| error.to_string())?;
                let file_type = manifest.file_context.file_type;
                if file_type == AttachmentFileType::TextLocal {
                    return Ok((
                        SubmissionAttachmentResult {
                            attachment_hash: hash.clone(),
                            file_type: Some(file_type),
                            status: AttachmentPreparationStatus::Ready,
                            disposition: Some("local_only".to_string()),
                            error_code: None,
                            error_message: None,
                        },
                        None,
                    ));
                }
                let path = storage
                    .find_object_blob(hash)
                    .map_err(|error| error.to_string())?;
                match ensure_file_uploaded_for_identity(
                    runtime,
                    &identity,
                    &path.to_string_lossy(),
                    cancellation,
                )
                .await
                {
                    Ok(ensured) => Ok((
                        SubmissionAttachmentResult {
                            attachment_hash: hash.clone(),
                            file_type: Some(file_type),
                            status: AttachmentPreparationStatus::Ready,
                            disposition: Some(ensured.disposition.as_str().to_string()),
                            error_code: None,
                            error_message: None,
                        },
                        Some(ensured.file_ref),
                    )),
                    Err(error) => Ok((
                        submission_failure(hash.clone(), Some(file_type), error),
                        None,
                    )),
                }
            }
        });
        let settled = join_all(futures).await;
        let mut attachments = Vec::with_capacity(settled.len());
        let mut files_by_hash = HashMap::new();
        for (index, settled) in settled.into_iter().enumerate() {
            match settled {
                Ok((result, file_ref)) => {
                    if let Some(file_ref) = file_ref {
                        files_by_hash.insert(result.attachment_hash.clone(), file_ref);
                    }
                    attachments.push(result);
                }
                Err(error) => attachments.push(submission_failure(
                    request.attachment_hashes[index].clone(),
                    None,
                    error,
                )),
            }
        }
        let latest = match load_active_key_identity() {
            Ok(identity) => identity,
            Err(error) => return fail_all(error),
        };
        if latest.fingerprint != identity.fingerprint
            || latest.encrypted_key_ref != identity.encrypted_key_ref
        {
            continue;
        }
        if attachments.iter().any(|result| {
            result
                .error_message
                .as_deref()
                .is_some_and(is_transient_remote_error)
        }) {
            tokio::select! {
                _ = tokio::time::sleep(CONNECTIVITY_RETRY_DELAY) => continue,
                _ = cancellation.cancelled() => return fail_all("CANCELLED".to_string()),
            }
        }
        if attachments
            .iter()
            .any(|result| result.status != AttachmentPreparationStatus::Ready)
        {
            return PrepareSubmissionAttachmentsResult {
                preflight_token: None,
                results: attachments,
            };
        }
        let token = new_preflight_token();
        let lease = AttachmentPreflightLease {
            expires_at: Instant::now() + PREFLIGHT_LEASE_TTL,
            thread_id: request.thread_id.clone(),
            user_message_id: request.user_message_id.clone(),
            attachment_hashes: normalized_hashes(&request.attachment_hashes),
            key_fingerprint: identity.fingerprint,
            api_key: identity.api_key,
            files_by_hash,
        };
        let mut leases = runtime.attachment_preflight_leases.lock().await;
        leases.retain(|_, lease| lease.expires_at > Instant::now());
        leases.insert(token.clone(), lease);
        return PrepareSubmissionAttachmentsResult {
            preflight_token: Some(token),
            results: attachments,
        };
    }
}

pub(crate) async fn consume_attachment_preflight(
    runtime: &BrainRuntimeState,
    token: &str,
    thread_id: Option<&str>,
    user_message_id: Option<&str>,
    attachment_hashes: &[String],
) -> Result<ConsumedAttachmentPreflight, String> {
    let lease = runtime
        .attachment_preflight_leases
        .lock()
        .await
        .remove(token)
        .ok_or_else(|| {
            "Attachment preflight token is missing or was already consumed".to_string()
        })?;
    if lease.expires_at <= Instant::now() {
        return Err("Attachment preflight token expired".to_string());
    }
    if Some(lease.thread_id.as_str()) != thread_id
        || Some(lease.user_message_id.as_str()) != user_message_id
        || lease.attachment_hashes != normalized_hashes(attachment_hashes)
    {
        return Err("Attachment preflight token does not match this turn".to_string());
    }
    if squigit_auth::security::google_api_key_fingerprint(&lease.api_key) != lease.key_fingerprint {
        return Err("Attachment preflight credential fingerprint mismatch".to_string());
    }
    Ok(ConsumedAttachmentPreflight {
        api_key: lease.api_key,
        files_by_hash: lease.files_by_hash,
    })
}

pub(crate) async fn cancel_preflight(runtime: &BrainRuntimeState, preflight_id: Option<&str>) {
    let mut controls = runtime.attachment_preflights.lock().await;
    if let Some(preflight_id) = preflight_id {
        if let Some(control) = controls.remove(preflight_id) {
            control.cancel();
        }
    } else {
        for (_, control) in controls.drain() {
            control.cancel();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn lease() -> AttachmentPreflightLease {
        let api_key = "test-google-api-key".to_string();
        AttachmentPreflightLease {
            expires_at: Instant::now() + PREFLIGHT_LEASE_TTL,
            thread_id: "thread-1".to_string(),
            user_message_id: "msg-1".to_string(),
            attachment_hashes: vec![HASH.to_string()],
            key_fingerprint: squigit_auth::security::google_api_key_fingerprint(&api_key),
            api_key,
            files_by_hash: HashMap::new(),
        }
    }

    #[test]
    fn preflight_hash_binding_is_order_independent_and_deduplicated() {
        assert_eq!(
            normalized_hashes(&[
                HASH.to_ascii_uppercase(),
                HASH.to_string(),
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string(),
            ]),
            vec![
                HASH.to_string(),
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string(),
            ]
        );
    }

    #[tokio::test]
    async fn preflight_lease_is_bound_and_consumed_once() {
        let runtime = BrainRuntimeState::new();
        runtime
            .attachment_preflight_leases
            .lock()
            .await
            .insert("token".to_string(), lease());

        let consumed = consume_attachment_preflight(
            &runtime,
            "token",
            Some("thread-1"),
            Some("msg-1"),
            &[HASH.to_string()],
        )
        .await
        .expect("matching lease should be consumed");
        assert_eq!(consumed.api_key, "test-google-api-key");

        let error = consume_attachment_preflight(
            &runtime,
            "token",
            Some("thread-1"),
            Some("msg-1"),
            &[HASH.to_string()],
        )
        .await
        .expect_err("a consumed lease must not be reusable");
        assert!(error.contains("already consumed"));
    }

    #[tokio::test]
    async fn shutdown_cancels_jobs_preflights_and_leases() {
        let runtime = BrainRuntimeState::new();
        let job_cancel = CancellationToken::new();
        runtime.attachment_jobs.lock().await.insert(
            "job".to_string(),
            AttachmentPreparationJob {
                cancellation: job_cancel.clone(),
                work_key: None,
            },
        );
        let preflight_cancel = CancellationToken::new();
        runtime
            .attachment_preflights
            .lock()
            .await
            .insert("preflight".to_string(), preflight_cancel.clone());
        runtime
            .attachment_preflight_leases
            .lock()
            .await
            .insert("token".to_string(), lease());

        cancel_all_attachment_jobs(&runtime).await;

        assert!(job_cancel.is_cancelled());
        assert!(preflight_cancel.is_cancelled());
        assert!(runtime.attachment_jobs.lock().await.is_empty());
        assert!(runtime.attachment_preflights.lock().await.is_empty());
        assert!(runtime.attachment_preflight_leases.lock().await.is_empty());
    }
}
