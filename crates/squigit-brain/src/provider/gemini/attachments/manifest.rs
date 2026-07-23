// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_storage::{AttachmentFileType, AttachmentManifestEntry, ThreadMessage, ThreadStorage};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::{ensure_file_uploaded, GeminiFileRef};
use crate::provider::gemini::transport::types::{GeminiFileData, GeminiPart};

type GeminiFileCache = Arc<Mutex<HashMap<String, GeminiFileRef>>>;

pub(crate) struct PreparedTurnAttachments {
    pub(crate) uploaded_parts: Vec<GeminiPart>,
}

pub(crate) struct RecallThreadAttachmentOutcome {
    pub(crate) response_value: serde_json::Value,
    pub(crate) follow_up_parts: Vec<GeminiPart>,
    pub(crate) message: String,
    pub(crate) is_failure: bool,
}

fn storage() -> Result<ThreadStorage, String> {
    ThreadStorage::new().map_err(|error| error.to_string())
}

fn is_uploadable(file_type: &AttachmentFileType) -> bool {
    matches!(
        file_type,
        AttachmentFileType::ImageUpload | AttachmentFileType::DocumentUpload
    )
}

fn file_type_label(file_type: &AttachmentFileType) -> &'static str {
    match file_type {
        AttachmentFileType::TextLocal => "text_local",
        AttachmentFileType::ImageUpload => "image_upload",
        AttachmentFileType::DocumentUpload => "document_upload",
    }
}

fn kind_matches(file_type: &AttachmentFileType, kind: Option<&str>) -> bool {
    let Some(kind) = kind.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };
    match kind.to_ascii_lowercase().as_str() {
        "image" | "image_upload" => *file_type == AttachmentFileType::ImageUpload,
        "document" | "document_upload" => *file_type == AttachmentFileType::DocumentUpload,
        "text" | "text_local" => *file_type == AttachmentFileType::TextLocal,
        _ => true,
    }
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

pub(crate) fn build_attachment_manifest_context(
    thread_id: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(thread_id) = thread_id else {
        return Ok(None);
    };
    let manifest = storage()?
        .refresh_attachment_manifest(thread_id)
        .map_err(|error| error.to_string())?;
    Ok(Some(format!(
        "[Attachment Manifest]\n{}",
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?
    )))
}

pub(crate) fn load_attachment_display_names(
    thread_id: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let Some(thread_id) = thread_id else {
        return Ok(Vec::new());
    };
    Ok(storage()?
        .refresh_attachment_manifest(thread_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|entry| (entry.attachment_hash, entry.display_name))
        .collect())
}

pub(crate) async fn prepare_turn_attachments(
    thread_id: Option<&str>,
    user_message_id: Option<&str>,
    api_key: &str,
    cache: &GeminiFileCache,
) -> Result<PreparedTurnAttachments, String> {
    let (Some(thread_id), Some(message_id)) = (thread_id, user_message_id) else {
        return Ok(PreparedTurnAttachments {
            uploaded_parts: Vec::new(),
        });
    };
    let storage = storage()?;
    let message = storage
        .get_message(thread_id, message_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("User message not found: {message_id}"))?;
    let ThreadMessage::User { attachments, .. } = message else {
        return Err(format!("Message is not a user message: {message_id}"));
    };
    let manifest = storage
        .refresh_attachment_manifest(thread_id)
        .map_err(|error| error.to_string())?;
    let by_hash = manifest
        .into_iter()
        .map(|entry| (entry.attachment_hash.clone(), entry))
        .collect::<HashMap<_, _>>();
    let mut uploaded_parts = Vec::new();

    for attachment in attachments {
        let Some(entry) = by_hash.get(&attachment.attachment_hash) else {
            return Err(format!(
                "Attachment {} is missing from the thread manifest",
                attachment.attachment_hash
            ));
        };
        if !is_uploadable(&entry.file_type) {
            continue;
        }
        let path = storage
            .find_object_blob(&entry.attachment_hash)
            .map_err(|error| error.to_string())?;
        let file_ref = ensure_file_uploaded(api_key, &path.to_string_lossy(), cache).await?;
        uploaded_parts.push(to_file_part(&file_ref));
    }

    Ok(PreparedTurnAttachments { uploaded_parts })
}

fn matching_entries<'a>(
    manifest: &'a [AttachmentManifestEntry],
    target: &str,
    kind: Option<&str>,
) -> Vec<&'a AttachmentManifestEntry> {
    let target = target.trim();
    if target.is_empty() {
        return Vec::new();
    }
    let exact_hash = manifest
        .iter()
        .filter(|entry| {
            is_uploadable(&entry.file_type)
                && kind_matches(&entry.file_type, kind)
                && entry.attachment_hash.eq_ignore_ascii_case(target)
        })
        .collect::<Vec<_>>();
    if !exact_hash.is_empty() {
        return exact_hash;
    }
    let target_name = Path::new(target)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(target);
    let exact_name = manifest
        .iter()
        .filter(|entry| {
            is_uploadable(&entry.file_type)
                && kind_matches(&entry.file_type, kind)
                && entry.display_name.eq_ignore_ascii_case(target_name)
        })
        .collect::<Vec<_>>();
    if !exact_name.is_empty() {
        return exact_name;
    }
    let target_stem = Path::new(target_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(target_name);
    manifest
        .iter()
        .filter(|entry| {
            if !is_uploadable(&entry.file_type) || !kind_matches(&entry.file_type, kind) {
                return false;
            }
            let stem = Path::new(&entry.display_name)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            stem.eq_ignore_ascii_case(target_stem)
        })
        .collect()
}

pub(crate) async fn recall_thread_attachment(
    thread_id: &str,
    target: &str,
    kind: Option<&str>,
    _reason: Option<&str>,
    api_key: &str,
    cache: &GeminiFileCache,
) -> Result<RecallThreadAttachmentOutcome, String> {
    let storage = storage()?;
    let manifest = storage
        .refresh_attachment_manifest(thread_id)
        .map_err(|error| error.to_string())?;
    let matches = matching_entries(&manifest, target, kind);
    if matches.is_empty() {
        return Ok(RecallThreadAttachmentOutcome {
            response_value: serde_json::json!({
                "ok": false,
                "error_code": "attachment_not_found",
                "error_message": format!("No prior attachment matched `{target}`.")
            }),
            follow_up_parts: Vec::new(),
            message: format!("Attachment recall failed: nothing matched `{target}`."),
            is_failure: true,
        });
    }
    if matches.len() > 1 {
        let candidates = matches
            .iter()
            .map(|entry| {
                serde_json::json!({
                    "attachment_hash": entry.attachment_hash,
                    "display_name": entry.display_name,
                    "file_type": file_type_label(&entry.file_type),
                })
            })
            .collect::<Vec<_>>();
        return Ok(RecallThreadAttachmentOutcome {
            response_value: serde_json::json!({
                "ok": false,
                "error_code": "ambiguous_target",
                "error_message": format!("Multiple prior attachments matched `{target}`."),
                "candidates": candidates,
            }),
            follow_up_parts: Vec::new(),
            message: "Attachment recall needs clarification.".to_string(),
            is_failure: true,
        });
    }

    let selected = matches[0];
    let hash = selected.attachment_hash.clone();
    let display_name = selected.display_name.clone();
    let file_type = selected.file_type.clone();
    let path = storage
        .find_object_blob(&hash)
        .map_err(|error| error.to_string())?;
    let file_ref = ensure_file_uploaded(api_key, &path.to_string_lossy(), cache).await?;
    storage
        .touch_attachment(thread_id, &hash)
        .map_err(|error| error.to_string())?;

    Ok(RecallThreadAttachmentOutcome {
        response_value: serde_json::json!({
            "ok": true,
            "attachment_hash": hash,
            "display_name": display_name,
            "file_type": file_type_label(&file_type),
            "file_uri": file_ref.file_uri,
        }),
        follow_up_parts: vec![to_file_part(&file_ref)],
        message: format!("Recalled {display_name}"),
        is_failure: false,
    })
}
