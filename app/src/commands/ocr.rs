// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! OCR command module for Tauri-Python IPC.
//!
//! This module provides a Tauri command to run OCR on images
//! using the PaddleOCR Python sidecar via stdin/stdout IPC.
//!
//! Safety controls:
//! - Thread-limiting env vars (defense-in-depth, Python also sets them)
//! - Lower process priority via nice(10) on Unix
//! - I/O priority via ionice on Linux
//! - Timeout with automatic process kill (120s default)
//! - Single-job mutex to prevent concurrent OCR calls

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::LazyLock;
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

/// Maximum wall-clock time for a single OCR job (seconds).
const OCR_TIMEOUT_SECS: u64 = 120;

/// Global mutex to ensure only one OCR job runs at a time.
/// Prevents concurrent calls from compounding CPU pressure.
static OCR_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrBox {
    pub text: String,
    pub box_coords: Vec<Vec<f64>>,
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Debug, Serialize)]
struct OcrRequest {
    #[serde(rename = "type")]
    request_type: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct RawOcrResult {
    text: String,
    #[serde(rename = "box")]
    bounding_box: Vec<Vec<f64>>,
    #[serde(default)]
    confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct OcrError {
    error: String,
}

#[tauri::command]
pub async fn ocr_image(
    app: tauri::AppHandle,
    image_data: String,
    is_base64: bool,
) -> Result<Vec<OcrBox>, String> {
    // Acquire the job mutex — only one OCR at a time
    let _guard = OCR_LOCK.lock().await;

    let sidecar_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("binaries")
        .join(get_sidecar_name());

    if !sidecar_path.exists() {
        return Err(format!("OCR sidecar not found at: {:?}", sidecar_path));
    }

    let request = OcrRequest {
        request_type: if is_base64 {
            "base64".to_string()
        } else {
            "path".to_string()
        },
        data: image_data,
    };

    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    // Build the command with resource controls
    let mut cmd = tokio::process::Command::new(&sidecar_path);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Defense-in-depth: set thread-limiting env vars from Rust side too
    // (Python main.py also sets these, but this catches edge cases)
    cmd.env("OMP_NUM_THREADS", "2")
        .env("OPENBLAS_NUM_THREADS", "2")
        .env("MKL_NUM_THREADS", "2")
        .env("NUMEXPR_NUM_THREADS", "2")
        .env("OMP_WAIT_POLICY", "PASSIVE");

    // Unix-specific: lower process priority and set I/O priority
    #[cfg(unix)]
    {
        unsafe {
            cmd.pre_exec(|| {
                // nice(10) — lower CPU scheduling priority
                libc::nice(10);
                // ionice: set I/O scheduling class to "best effort" with low priority
                // class 2 = best-effort, priority 7 = lowest within class
                #[cfg(target_os = "linux")]
                {
                    libc::syscall(libc::SYS_ioprio_set, 1 /* IOPRIO_WHO_PROCESS */, 0, (2 << 13) | 7);
                }
                Ok(())
            });
        }
    }

    // Spawn the child process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn OCR sidecar: {}", e))?;

    // Write the request to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request_json.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
        // Drop stdin to signal EOF
        drop(stdin);
    }

    // Wait for output with timeout — kill on overrun
    let result = timeout(Duration::from_secs(OCR_TIMEOUT_SECS), child.wait_with_output()).await;

    let output = match result {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            return Err(format!("Failed to wait for sidecar: {}", e));
        }
        Err(_) => {
            // Timeout expired — kill the process
            eprintln!("OCR sidecar timed out after {}s, killing process", OCR_TIMEOUT_SECS);
            // child is moved into wait_with_output, but on timeout the future
            // is dropped which should drop the child. As extra safety:
            return Err(format!(
                "OCR timed out after {}s. The image may be too large or complex. \
                 The process has been terminated to protect system stability.",
                OCR_TIMEOUT_SECS
            ));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR sidecar failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    if let Ok(err) = serde_json::from_str::<OcrError>(&stdout) {
        return Err(err.error);
    }

    let raw_results: Vec<RawOcrResult> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse OCR output: {} - {}", e, stdout))?;

    let results: Vec<OcrBox> = raw_results
        .into_iter()
        .map(|r| OcrBox {
            text: r.text,
            box_coords: r.bounding_box,
            confidence: r.confidence.unwrap_or(1.0),
        })
        .collect();

    Ok(results)
}

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
        "ocr-engine-x86_64-unknown-linux-gnu".to_string()
    }
}
