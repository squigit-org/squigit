// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use squigit_memory::{
    ThreadAttachmentKind, ThreadAttachmentProviderFile, ThreadAttachmentRecord, ThreadData, ThreadStorage,
    StorageError,
};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::detector::{extract_attachment_mentions, AttachmentMention};
use super::types::GeminiFileObject;
use super::{
    ensure_file_uploaded, is_gemini_document_path, is_gemini_uploadable_path, is_image_path,
    is_text_like_path, mime_from_extension, GeminiFileRef,
};
use crate::provider::gemini::transport::types::{GeminiFileData, GeminiPart};

const MAX_ATTACHMENT_CATALOG_ITEMS: usize = 8;

type GeminiFileCache = Arc<Mutex<HashMap<String, GeminiFileRef>>>;

pub(crate) struct PreparedTurnAttachments {
    pub(crate) preview_attachment_paths: Vec<String>,
    pub(crate) uploaded_parts: Vec<GeminiPart>,
}

pub(crate) struct RecallThreadAttachmentOutcome {
    pub(crate) response_value: serde_json::Value,
    pub(crate) follow_up_parts: Vec<GeminiPart>,
    pub(crate) message: String,
    pub(crate) is_failure: bool,
}

fn normalized_lookup_key(value: &str) -> String {
    value
        .trim()
        .strip_prefix('<')
        .and_then(|v| v.strip_suffix('>'))
        .map(str::trim)
        .unwrap_or_else(|| value.trim())
        .to_string()
}

fn attachment_display_name(path: &str, explicit: Option<&str>) -> String {
    explicit
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            Path::new(path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(path)
        })
        .to_string()
}

fn classify_attachment(path: &str) -> Option<(ThreadAttachmentKind, String)> {
    if is_text_like_path(path) {
        return Some((
            ThreadAttachmentKind::TextLocal,
            mime_from_extension(path).to_string(),
        ));
    }
    if is_image_path(path) {
        return Some((
            ThreadAttachmentKind::ImageUpload,
            mime_from_extension(path).to_string(),
        ));
    }
    if is_gemini_document_path(path) {
        return Some((
            ThreadAttachmentKind::DocumentUpload,
            mime_from_extension(path).to_string(),
        ));
    }
    None
}

fn is_uploadable_kind(kind: &ThreadAttachmentKind) -> bool {
    matches!(
        kind,
        ThreadAttachmentKind::ImageUpload | ThreadAttachmentKind::DocumentUpload
    )
}

fn catalog_access_label(record: &ThreadAttachmentRecord) -> &'static str {
    match record.kind {
        ThreadAttachmentKind::TextLocal => "local",
        ThreadAttachmentKind::ImageUpload | ThreadAttachmentKind::DocumentUpload => {
            if record
                .provider_file
                .as_ref()
                .map(|handle| !is_handle_expired(handle))
                .unwrap_or(false)
            {
                "live"
            } else if record.provider_file.is_some() {
                "stale"
            } else {
                "needs_upload"
            }
        }
    }
}

fn kind_matches_filter(kind: &ThreadAttachmentKind, filter: Option<&ThreadAttachmentKind>) -> bool {
    match filter {
        Some(expected) => kind == expected,
        None => true,
    }
}

fn parse_kind_filter(kind: Option<&str>) -> Option<ThreadAttachmentKind> {
    match kind
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("image") | Some("image_upload") => Some(ThreadAttachmentKind::ImageUpload),
        Some("document") | Some("document_upload") => Some(ThreadAttachmentKind::DocumentUpload),
        _ => None,
    }
}

fn get_active_storage() -> Result<ThreadStorage, String> {
    super::paths::get_active_storage()
}

fn load_thread_for_registry(thread_id: &str) -> Result<Option<(ThreadStorage, ThreadData, bool)>, String> {
    let storage = get_active_storage()?;
    match storage.load_thread(thread_id) {
        Ok(mut thread) => {
            let changed = backfill_attachment_registry(&mut thread);
            Ok(Some((storage, thread, changed)))
        }
        Err(StorageError::ThreadNotFound(_)) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn save_thread_if_needed(
    storage: &ThreadStorage,
    thread: &ThreadData,
    changed: bool,
) -> Result<(), String> {
    if changed {
        storage.save_thread(thread).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn file_ref_to_handle(file_ref: &GeminiFileRef) -> ThreadAttachmentProviderFile {
    ThreadAttachmentProviderFile {
        file_uri: file_ref.file_uri.clone(),
        file_name: file_ref.file_name.clone(),
        mime_type: file_ref.mime_type.clone(),
        uploaded_at: file_ref.uploaded_at,
        expires_at: file_ref.expires_at,
        last_validated_at: Some(Utc::now()),
    }
}

fn handle_to_file_ref(handle: &ThreadAttachmentProviderFile, display_name: &str) -> GeminiFileRef {
    GeminiFileRef {
        file_uri: handle.file_uri.clone(),
        file_name: handle.file_name.clone(),
        mime_type: handle.mime_type.clone(),
        display_name: display_name.to_string(),
        uploaded_at: handle.uploaded_at,
        expires_at: handle.expires_at,
    }
}

fn upsert_record(
    thread: &mut ThreadData,
    path: &str,
    display_name: Option<&str>,
    seen_at: DateTime<Utc>,
) -> bool {
    let Some((kind, mime_type)) = classify_attachment(path) else {
        return false;
    };

    let key = normalized_lookup_key(path);
    let fallback_display_name = attachment_display_name(&key, display_name);

    match thread.attachment_registry.get_mut(&key) {
        Some(existing) => {
            let mut changed = false;
            if display_name
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some()
                && existing.display_name != fallback_display_name
            {
                existing.display_name = fallback_display_name;
                changed = true;
            }
            if existing.kind != kind {
                existing.kind = kind;
                changed = true;
            }
            if existing.mime_type != mime_type {
                existing.mime_type = mime_type;
                changed = true;
            }
            if existing.last_seen_at < seen_at {
                existing.last_seen_at = seen_at;
                changed = true;
            }
            changed
        }
        None => {
            thread.attachment_registry.insert(
                key.clone(),
                ThreadAttachmentRecord {
                    cas_path: key,
                    display_name: fallback_display_name,
                    kind,
                    mime_type,
                    source_path: None,
                    provider_file: None,
                    last_seen_at: seen_at,
                    last_recalled_at: None,
                },
            );
            true
        }
    }
}

fn backfill_attachment_registry(thread: &mut ThreadData) -> bool {
    let mut changed = false;
    let saved_messages = thread
        .messages
        .iter()
        .filter(|message| message.role == "user")
        .map(|message| (message.timestamp, message.content.clone()))
        .collect::<Vec<_>>();

    for (timestamp, content) in saved_messages {
        for mention in extract_attachment_mentions(&content) {
            changed |= upsert_record(
                thread,
                &mention.path,
                mention.display_name.as_deref(),
                timestamp,
            );
        }
    }

    changed
}

async fn cache_key_for_path(path: &str) -> Result<String, String> {
    let resolved = super::paths::resolve_attachment_path_internal(path)?;
    Ok(resolved
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string())
}

async fn get_cached_file_ref(
    path: &str,
    cache: &GeminiFileCache,
) -> Result<Option<GeminiFileRef>, String> {
    let key = cache_key_for_path(path).await?;
    let cache_lock = cache.lock().await;
    Ok(cache_lock.get(&key).cloned())
}

async fn insert_cached_file_ref(
    path: &str,
    file_ref: GeminiFileRef,
    cache: &GeminiFileCache,
) -> Result<(), String> {
    let key = cache_key_for_path(path).await?;
    let mut cache_lock = cache.lock().await;
    cache_lock.insert(key, file_ref);
    Ok(())
}

async fn remove_cached_file_ref(path: &str, cache: &GeminiFileCache) -> Result<(), String> {
    let key = cache_key_for_path(path).await?;
    let mut cache_lock = cache.lock().await;
    cache_lock.remove(&key);
    Ok(())
}

fn is_handle_expired(handle: &ThreadAttachmentProviderFile) -> bool {
    Utc::now() >= handle.expires_at
}

fn is_file_ref_expired(file_ref: &GeminiFileRef) -> bool {
    Utc::now() >= file_ref.expires_at
}

async fn validate_uploaded_file_handle(api_key: &str, file_name: &str) -> bool {
    if file_name.trim().is_empty() {
        return false;
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/{}?key={}",
        file_name, api_key
    );

    let response = match client.get(url).send().await {
        Ok(response) => response,
        Err(_) => return true,
    };

    if !response.status().is_success() {
        return false;
    }

    match response.json::<GeminiFileObject>().await {
        Ok(file_obj) => file_obj
            .state
            .as_deref()
            .map(|state| state == "ACTIVE")
            .unwrap_or(true),
        Err(_) => true,
    }
}

async fn ensure_live_file_ref(
    thread: &mut ThreadData,
    path: &str,
    api_key: &str,
    cache: &GeminiFileCache,
) -> Result<(GeminiFileRef, bool, &'static str), String> {
    let key = normalized_lookup_key(path);
    let record = thread
        .attachment_registry
        .get_mut(&key)
        .ok_or_else(|| format!("Attachment is not tracked in this thread: {}", key))?;

    if !is_uploadable_kind(&record.kind) {
        return Err(format!(
            "Attachment is not uploadable via Gemini Files: {}",
            record.display_name
        ));
    }

    if let Some(existing) = record.provider_file.as_mut() {
        if !is_handle_expired(existing)
            && validate_uploaded_file_handle(api_key, &existing.file_name).await
        {
            existing.last_validated_at = Some(Utc::now());
            let file_ref = handle_to_file_ref(existing, &record.display_name);
            insert_cached_file_ref(path, file_ref.clone(), cache).await?;
            return Ok((file_ref, true, "cached_uri"));
        }

        remove_cached_file_ref(path, cache).await?;
    }

    if let Some(cached) = get_cached_file_ref(path, cache).await? {
        if !is_file_ref_expired(&cached)
            && validate_uploaded_file_handle(api_key, &cached.file_name).await
        {
            record.provider_file = Some(file_ref_to_handle(&cached));
            return Ok((cached, true, "cached_uri"));
        }

        remove_cached_file_ref(path, cache).await?;
    }

    let uploaded = ensure_file_uploaded(api_key, path, cache).await?;
    record.provider_file = Some(file_ref_to_handle(&uploaded));
    Ok((uploaded, true, "silent_reupload"))
}

fn to_file_part(file_ref: &GeminiFileRef) -> GeminiPart {
    GeminiPart {
        file_data: Some(GeminiFileData {
            mime_type: file_ref.mime_type.clone(),
            file_uri: file_ref.file_uri.clone(),
        }),
        ..Default::default()
    }
}

pub(crate) async fn prepare_turn_attachments(
    thread_id: Option<&str>,
    mentions: &[AttachmentMention],
    api_key: &str,
    cache: &GeminiFileCache,
) -> Result<PreparedTurnAttachments, String> {
    let mut loaded_thread = match thread_id {
        Some(id) => load_thread_for_registry(id)?,
        None => None,
    };
    let mut preview_attachment_paths = Vec::new();
    let mut uploaded_parts = Vec::new();

    for mention in mentions {
        let path = normalized_lookup_key(&mention.path);

        if let Some((_, thread, changed)) = loaded_thread.as_mut() {
            *changed |= upsert_record(thread, &path, mention.display_name.as_deref(), Utc::now());
        }

        if is_text_like_path(&path) {
            preview_attachment_paths.push(path);
            continue;
        }

        if !is_gemini_uploadable_path(&path) {
            continue;
        }

        let file_ref = if let Some((_, thread, changed)) = loaded_thread.as_mut() {
            let (file_ref, was_changed, _) =
                ensure_live_file_ref(thread, &path, api_key, cache).await?;
            *changed |= was_changed;
            file_ref
        } else {
            ensure_file_uploaded(api_key, &path, cache).await?
        };

        uploaded_parts.push(to_file_part(&file_ref));
    }

    if let Some((storage, thread, changed)) = loaded_thread.as_ref() {
        save_thread_if_needed(storage, thread, *changed)?;
    }

    Ok(PreparedTurnAttachments {
        preview_attachment_paths,
        uploaded_parts,
    })
}

pub(crate) fn build_thread_attachment_catalog(
    thread_id: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(thread_id) = thread_id else {
        return Ok(None);
    };
    let Some((storage, thread, changed)) = load_thread_for_registry(thread_id)? else {
        return Ok(None);
    };

    let mut entries = thread
        .attachment_registry
        .values()
        .cloned()
        .collect::<Vec<_>>();

    if entries.is_empty() {
        save_thread_if_needed(&storage, &thread, changed)?;
        return Ok(None);
    }

    entries.sort_by(|left, right| right.last_seen_at.cmp(&left.last_seen_at));
    entries.truncate(MAX_ATTACHMENT_CATALOG_ITEMS);

    let lines = entries
        .into_iter()
        .map(|record| {
            format!(
                "- `{}` (kind: {}, access: {}): `{}`",
                record.display_name,
                match record.kind {
                    ThreadAttachmentKind::ImageUpload => "image_upload",
                    ThreadAttachmentKind::DocumentUpload => "document_upload",
                    ThreadAttachmentKind::TextLocal => "text_local",
                },
                catalog_access_label(&record),
                record.cas_path
            )
        })
        .collect::<Vec<_>>();

    save_thread_if_needed(&storage, &thread, changed)?;
    Ok(Some(format!(
        "[Thread Attachment Catalog]\n{}",
        lines.join("\n")
    )))
}

pub(crate) fn load_thread_attachment_display_names(
    thread_id: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let Some(thread_id) = thread_id else {
        return Ok(Vec::new());
    };
    let Some((storage, thread, changed)) = load_thread_for_registry(thread_id)? else {
        return Ok(Vec::new());
    };

    let entries = thread
        .attachment_registry
        .values()
        .map(|record| (record.cas_path.clone(), record.display_name.clone()))
        .collect::<Vec<_>>();

    save_thread_if_needed(&storage, &thread, changed)?;
    Ok(entries)
}

fn find_matching_records<'a>(
    thread: &'a ThreadData,
    target: &str,
    kind_filter: Option<&ThreadAttachmentKind>,
) -> Vec<&'a ThreadAttachmentRecord> {
    let target = normalized_lookup_key(target);
    if target.is_empty() {
        return Vec::new();
    }

    let exact_path_matches = thread
        .attachment_registry
        .values()
        .filter(|record| {
            is_uploadable_kind(&record.kind)
                && kind_matches_filter(&record.kind, kind_filter)
                && normalized_lookup_key(&record.cas_path) == target
        })
        .collect::<Vec<_>>();
    if !exact_path_matches.is_empty() {
        return exact_path_matches;
    }

    let exact_display_matches = thread
        .attachment_registry
        .values()
        .filter(|record| {
            is_uploadable_kind(&record.kind)
                && kind_matches_filter(&record.kind, kind_filter)
                && record.display_name.eq_ignore_ascii_case(&target)
        })
        .collect::<Vec<_>>();
    if !exact_display_matches.is_empty() {
        return exact_display_matches;
    }

    thread.attachment_registry
        .values()
        .filter(|record| {
            if !is_uploadable_kind(&record.kind) || !kind_matches_filter(&record.kind, kind_filter)
            {
                return false;
            }

            let file_name = Path::new(&record.cas_path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            let stem = Path::new(file_name)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("");

            file_name.eq_ignore_ascii_case(&target) || stem.eq_ignore_ascii_case(&target)
        })
        .collect::<Vec<_>>()
}

pub(crate) async fn recall_thread_attachment(
    thread_id: &str,
    target: &str,
    kind: Option<&str>,
    _reason: Option<&str>,
    api_key: &str,
    cache: &GeminiFileCache,
) -> Result<RecallThreadAttachmentOutcome, String> {
    let Some((storage, mut thread, mut changed)) = load_thread_for_registry(thread_id)? else {
        return Ok(RecallThreadAttachmentOutcome {
            response_value: serde_json::json!({
                "ok": false,
                "error_code": "thread_not_found",
                "error_message": "The active thread could not be loaded for attachment recall."
            }),
            follow_up_parts: Vec::new(),
            message: "Attachment recall failed: active thread not found.".to_string(),
            is_failure: true,
        });
    };

    let kind_filter = parse_kind_filter(kind);
    let mut matches = find_matching_records(&thread, target, kind_filter.as_ref());
    if matches.is_empty() {
        let uploadable = thread
            .attachment_registry
            .values()
            .filter(|record| {
                is_uploadable_kind(&record.kind)
                    && kind_matches_filter(&record.kind, kind_filter.as_ref())
            })
            .collect::<Vec<_>>();
        if uploadable.len() == 1 {
            matches = uploadable;
        }
    }

    if matches.is_empty() {
        save_thread_if_needed(&storage, &thread, changed)?;
        return Ok(RecallThreadAttachmentOutcome {
            response_value: serde_json::json!({
                "ok": false,
                "error_code": "attachment_not_found",
                "error_message": format!("No previously uploaded attachment matched `{}`.", target)
            }),
            follow_up_parts: Vec::new(),
            message: format!("Attachment recall failed: nothing matched `{}`.", target),
            is_failure: true,
        });
    }

    if matches.len() > 1 {
        let candidates = matches
            .into_iter()
            .map(|record| {
                serde_json::json!({
                    "display_name": record.display_name,
                    "cas_path": record.cas_path,
                    "kind": match record.kind {
                        ThreadAttachmentKind::ImageUpload => "image_upload",
                        ThreadAttachmentKind::DocumentUpload => "document_upload",
                        ThreadAttachmentKind::TextLocal => "text_local",
                    }
                })
            })
            .collect::<Vec<_>>();
        save_thread_if_needed(&storage, &thread, changed)?;
        return Ok(RecallThreadAttachmentOutcome {
            response_value: serde_json::json!({
                "ok": false,
                "error_code": "ambiguous_target",
                "error_message": format!(
                    "Multiple previously uploaded attachments matched `{}`. Ask the user which one they mean.",
                    target
                ),
                "candidates": candidates,
            }),
            follow_up_parts: Vec::new(),
            message: "Attachment recall needs clarification.".to_string(),
            is_failure: true,
        });
    }

    let selected_path = matches
        .first()
        .map(|record| record.cas_path.clone())
        .ok_or_else(|| "Attachment recall failed to select a match".to_string())?;
    let selected_display_name = matches
        .first()
        .map(|record| record.display_name.clone())
        .unwrap_or_else(|| selected_path.clone());
    let selected_kind = matches
        .first()
        .map(|record| record.kind.clone())
        .unwrap_or(ThreadAttachmentKind::DocumentUpload);
    drop(matches);

    let (file_ref, file_changed, strategy) =
        ensure_live_file_ref(&mut thread, &selected_path, api_key, cache).await?;
    if let Some(record) = thread.attachment_registry.get_mut(&selected_path) {
        record.last_recalled_at = Some(Utc::now());
    }
    changed |= file_changed;

    save_thread_if_needed(&storage, &thread, changed)?;

    Ok(RecallThreadAttachmentOutcome {
        response_value: serde_json::json!({
            "ok": true,
            "display_name": selected_display_name,
            "cas_path": selected_path,
            "kind": match selected_kind {
                ThreadAttachmentKind::ImageUpload => "image_upload",
                ThreadAttachmentKind::DocumentUpload => "document_upload",
                ThreadAttachmentKind::TextLocal => "text_local",
            },
            "recall_strategy": strategy,
            "file_uri": file_ref.file_uri,
        }),
        follow_up_parts: vec![to_file_part(&file_ref)],
        message: format!("Recalled {}", selected_display_name),
        is_failure: false,
    })
}
