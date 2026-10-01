// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::Path;

pub fn is_disabled_document(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "pdf" | "docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt"
            )
        })
}
pub fn mime_from_extension(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    }
}
pub(crate) async fn from_path(path: &str) -> Result<Value, String> {
    let mime = mime_from_extension(
        Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or(""),
    );
    if !mime.starts_with("image/") {
        return Err("Only local image renditions can be sent during this phase".to_string());
    }
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|error| error.to_string())?;
    Ok(
        json!({"type":"image_url", "image_url":{"url":format!("data:{mime};base64,{}", STANDARD.encode(bytes))}}),
    )
}
pub(crate) async fn from_hash(hash: &str) -> Result<Value, String> {
    let storage = squigit_storage::ThreadStorage::new().map_err(|error| error.to_string())?;
    let object = storage
        .load_object_manifest(hash)
        .map_err(|error| error.to_string())?;
    if object.file_context.file_type != squigit_storage::AttachmentFileType::Image {
        return Err("PDF and Office attachments are temporarily unavailable".to_string());
    }
    let path = storage
        .find_object_blob(hash)
        .map_err(|error| error.to_string())?;
    from_path(&path.to_string_lossy()).await
}
