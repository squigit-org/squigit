// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{Duration, Utc};
use reqwest::{header, Client};
use tokio_util::sync::CancellationToken;

use super::types::{GeminiFileObject, GeminiFileUploadFinalizeResponse};
use super::GeminiFileRef;

pub async fn upload_file_to_gemini(
    api_key: &str,
    file_path: &str,
    mime_type: &str,
    display_name: &str,
) -> Result<GeminiFileRef, String> {
    upload_file_to_gemini_cancellable(
        api_key,
        file_path,
        mime_type,
        display_name,
        &CancellationToken::new(),
    )
    .await
}

pub(crate) async fn upload_file_to_gemini_cancellable(
    api_key: &str,
    file_path: &str,
    mime_type: &str,
    display_name: &str,
    cancel_token: &CancellationToken,
) -> Result<GeminiFileRef, String> {
    let client = Client::new();
    let file_bytes = tokio::select! {
        result = tokio::fs::read(file_path) => {
            result.map_err(|e| format!("Failed to read file: {}", e))?
        }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };
    let file_size = file_bytes.len();

    // Step 1: Start Resumable Upload
    let start_url = "https://generativelanguage.googleapis.com/upload/v1beta/files";

    let mut headers = header::HeaderMap::new();
    let mut api_key_header = header::HeaderValue::from_str(api_key)
        .map_err(|_| "The Google AI Studio credential is not a valid HTTP header".to_string())?;
    api_key_header.set_sensitive(true);
    headers.insert("x-goog-api-key", api_key_header);
    headers.insert(
        "X-Goog-Upload-Protocol",
        header::HeaderValue::from_static("resumable"),
    );
    headers.insert(
        "X-Goog-Upload-Command",
        header::HeaderValue::from_static("start"),
    );
    headers.insert(
        "X-Goog-Upload-Header-Content-Length",
        file_size.to_string().parse().unwrap(),
    );
    headers.insert(
        "X-Goog-Upload-Header-Content-Type",
        header::HeaderValue::from_str(mime_type).unwrap(),
    );

    let body = serde_json::json!({
        "file": {
            "display_name": display_name
        }
    });

    let res1 = tokio::select! {
        result = client.post(start_url).headers(headers).json(&body).send() => {
            result.map_err(|_| "TRANSIENT: Start upload failed".to_string())?
        }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };

    if !res1.status().is_success() {
        let status = res1.status();
        let prefix = if status.is_server_error() {
            "TRANSIENT: "
        } else {
            ""
        };
        return Err(format!("{prefix}Gemini API Error (Upload Start {status})"));
    }

    let upload_url = res1
        .headers()
        .get("X-Goog-Upload-URL")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing X-Goog-Upload-URL header")?
        .to_string();

    // Step 2: Upload Bytes
    let mut headers2 = header::HeaderMap::new();
    headers2.insert(
        "X-Goog-Upload-Offset",
        header::HeaderValue::from_static("0"),
    );
    headers2.insert(
        "X-Goog-Upload-Command",
        header::HeaderValue::from_static("upload, finalize"),
    );
    headers2.insert(
        header::CONTENT_LENGTH,
        file_size.to_string().parse().unwrap(),
    );

    let res2 = tokio::select! {
        result = client.put(&upload_url).headers(headers2).body(file_bytes).send() => {
            result.map_err(|_| "TRANSIENT: Finalize upload failed".to_string())?
        }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };

    if !res2.status().is_success() {
        let status = res2.status();
        let prefix = if status.is_server_error() {
            "TRANSIENT: "
        } else {
            ""
        };
        return Err(format!(
            "{prefix}Gemini API Error (Upload Finalize {status})"
        ));
    }

    let final_res: GeminiFileUploadFinalizeResponse = tokio::select! {
        result = res2.json() => {
            result.map_err(|e| format!("Failed to parse upload response: {}", e))?
        }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };

    // Step 3: Poll for ACTIVE state if needed
    let file_obj = final_res.file;
    let name = file_obj.name.ok_or("Missing file name")?;
    let uri = file_obj.uri.ok_or("Missing file uri")?;

    poll_file_status_cancellable(api_key, &name, cancel_token).await?;

    Ok(GeminiFileRef {
        file_uri: uri,
        file_name: name,
        mime_type: mime_type.to_string(),
        display_name: display_name.to_string(),
        uploaded_at: Utc::now(),
        expires_at: Utc::now() + Duration::hours(47),
    })
}

pub async fn poll_file_status(api_key: &str, file_name: &str) -> Result<(), String> {
    poll_file_status_cancellable(api_key, file_name, &CancellationToken::new()).await
}

pub(crate) async fn poll_file_status_cancellable(
    api_key: &str,
    file_name: &str,
    cancel_token: &CancellationToken,
) -> Result<(), String> {
    let client = Client::new();
    let url = format!("https://generativelanguage.googleapis.com/v1beta/{file_name}");
    let mut api_key_header = header::HeaderValue::from_str(api_key)
        .map_err(|_| "The Google AI Studio credential is not a valid HTTP header".to_string())?;
    api_key_header.set_sensitive(true);

    loop {
        let res = tokio::select! {
            result = client.get(&url).header("x-goog-api-key", api_key_header.clone()).send() => {
                result.map_err(|_| "TRANSIENT: Poll failed".to_string())?
            }
            _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
        };
        if !res.status().is_success() {
            let status = res.status();
            let prefix = if status.is_server_error() {
                "TRANSIENT: "
            } else {
                ""
            };
            return Err(format!("{prefix}Gemini API Error (Poll {status})"));
        }

        let file_obj: GeminiFileObject =
            res.json().await.map_err(|e| format!("Poll parse: {}", e))?;
        if let Some(state) = file_obj.state {
            if state == "ACTIVE" {
                break;
            } else if state == "FAILED" {
                return Err("File processing failed".to_string());
            }
        }
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_millis(1500)) => {}
            _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
        }
    }
    Ok(())
}
