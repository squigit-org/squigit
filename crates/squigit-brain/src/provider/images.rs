// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::Path;

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
        return Err("Expected a local image rendition".to_string());
    }
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|error| error.to_string())?;
    Ok(
        json!({"type":"image_url", "image_url":{"url":format!("data:{mime};base64,{}", STANDARD.encode(bytes))}}),
    )
}
