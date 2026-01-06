/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

//! OCR command module for Tauri-Python IPC.
//!
//! This module provides a Tauri command to run OCR on images
//! using the PaddleOCR Python sidecar via stdin/stdout IPC.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::Manager;

/// OCR bounding box coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrBox {
    pub text: String,
    pub box_coords: Vec<Vec<f64>>,
    #[serde(default)]
    pub confidence: f64,
}

/// Request payload for OCR IPC.
#[derive(Debug, Serialize)]
struct OcrRequest {
    #[serde(rename = "type")]
    request_type: String,
    data: String,
}

/// Raw OCR result from Python sidecar.
#[derive(Debug, Deserialize)]
struct RawOcrResult {
    text: String,
    box: Vec<Vec<f64>>,
    #[serde(default)]
    confidence: Option<f64>,
}

/// Error response from Python sidecar.
#[derive(Debug, Deserialize)]
struct OcrError {
    error: String,
}

/// Run OCR on an image.
///
/// # Arguments
/// * `image_data` - Either a file path or base64-encoded image data.
/// * `is_base64` - If true, treat `image_data` as base64; otherwise treat as file path.
///
/// # Returns
/// A vector of OCR boxes containing detected text and coordinates.
#[tauri::command]
pub async fn ocr_image(
    app: tauri::AppHandle,
    image_data: String,
    is_base64: bool,
) -> Result<Vec<OcrBox>, String> {
    // Get the sidecar path
    let sidecar_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("binaries")
        .join(get_sidecar_name());

    if !sidecar_path.exists() {
        return Err(format!("OCR sidecar not found at: {:?}", sidecar_path));
    }

    // Build the IPC request
    let request = OcrRequest {
        request_type: if is_base64 {
            "base64".to_string()
        } else {
            "path".to_string()
        },
        data: image_data,
    };

    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("Failed to serialize request: {}", e))?;

    // Spawn the sidecar process with stdin/stdout
    let mut child = Command::new(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn OCR sidecar: {}", e))?;

    // Write request to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request_json.as_bytes())
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
    }

    // Wait for process to complete
    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for sidecar: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR sidecar failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Try to parse as error first
    if let Ok(err) = serde_json::from_str::<OcrError>(&stdout) {
        return Err(err.error);
    }

    // Parse as OCR results
    let raw_results: Vec<RawOcrResult> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse OCR output: {} - {}", e, stdout))?;

    // Convert to our format
    let results: Vec<OcrBox> = raw_results
        .into_iter()
        .map(|r| OcrBox {
            text: r.text,
            box_coords: r.box,
            confidence: r.confidence.unwrap_or(1.0),
        })
        .collect();

    Ok(results)
}

/// Get the platform-specific sidecar executable name.
fn get_sidecar_name() -> String {
    #[cfg(target_os = "windows")]
    {
        "ocr-engine.exe".to_string()
    }
    #[cfg(target_os = "macos")]
    {
        "ocr-engine".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        // Use the target triple format that Tauri uses for sidecars
        "ocr-engine-x86_64-unknown-linux-gnu".to_string()
    }
}
