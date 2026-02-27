// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! OCR command module for Tauri-Python IPC.
//!
//! This module provides Tauri commands to run and cancel OCR on images
//! using the PaddleOCR Python sidecar via stdin/stdout IPC.
//!
//! Safety controls:
//! - Thread-limiting env vars (defense-in-depth, Python also sets them)
//! - Lower process priority via nice(10) on Unix
//! - I/O priority via ionice on Linux
//! - Timeout with automatic process kill (120s default)
//! - Single-job mutex to prevent concurrent OCR calls
//! - Cancellation via stdin CANCEL signal + fallback kill

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::LazyLock;
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

use crate::services::models::ModelManager;
use crate::state::{AppState, OcrJobHandle};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrModelConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    lang: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    det_model_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rec_model_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cls_model_dir: Option<String>,
}

#[derive(Debug, Serialize)]
struct OcrRequest {
    #[serde(rename = "type")]
    request_type: String,
    data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    config: Option<OcrModelConfig>,
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

/// Send CANCEL to sidecar stdin and wait for graceful shutdown,
/// with fallback to kill if the process doesn't exit in time.
async fn cancel_job_handle(mut handle: OcrJobHandle) {
    // Send CANCEL via stdin
    let _ = handle.stdin.write_all(b"CANCEL\n").await;
    let _ = handle.stdin.flush().await;

    // Wait 500ms for graceful exit (Python os._exit(2))
    match timeout(Duration::from_millis(500), handle.child.wait()).await {
        Ok(_) => {} // Process exited
        Err(_) => {
            // Fallback: force kill
            let _ = handle.child.kill().await;
            let _ = handle.child.wait().await;
        }
    }
}

#[tauri::command]
pub async fn ocr_image(
    app: tauri::AppHandle,
    image_data: String,
    is_base64: bool,
    model_name: Option<String>,
) -> Result<Vec<OcrBox>, String> {
    let _guard = OCR_LOCK.lock().await;

    let state = app.state::<AppState>();

    // Cancel any lingering previous job (defensive)
    {
        let mut job_lock = state.ocr_job.lock().await;
        if let Some(old_handle) = job_lock.take() {
            cancel_job_handle(old_handle).await;
        }
    }

    let sidecar_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("binaries")
        .join(get_sidecar_name());

    if !sidecar_path.exists() {
        return Err(format!("OCR sidecar not found at: {:?}", sidecar_path));
    }

    let mut model_config: Option<OcrModelConfig> = None;

    if let Some(name) = model_name {
        let manager = ModelManager::new().map_err(|e| e.to_string())?;

        let model_dir = manager.get_model_dir(&name);
        if manager.is_model_installed(&name) {
            let lang_code = name.split('-').last().unwrap_or("en").to_string();

            model_config = Some(OcrModelConfig {
                lang: Some(lang_code),
                det_model_dir: None,
                rec_model_dir: Some(model_dir.to_string_lossy().to_string()),
                cls_model_dir: None,
            });
        }
    }

    let request = OcrRequest {
        request_type: if is_base64 {
            "base64".to_string()
        } else {
            "path".to_string()
        },
        data: image_data,
        config: model_config,
    };

    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    let mut cmd = tokio::process::Command::new(&sidecar_path);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    cmd.env("OMP_NUM_THREADS", "1")
        .env("OPENBLAS_NUM_THREADS", "1")
        .env("MKL_NUM_THREADS", "1")
        .env("NUMEXPR_NUM_THREADS", "1")
        .env("OMP_WAIT_POLICY", "PASSIVE");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00004000);
    }

    #[cfg(unix)]
    {
        unsafe {
            cmd.pre_exec(|| {
                libc::nice(10);

                #[cfg(target_os = "linux")]
                {
                    libc::syscall(
                        libc::SYS_ioprio_set,
                        1, /* IOPRIO_WHO_PROCESS */
                        0,
                        (2 << 13) | 7,
                    );
                }
                Ok(())
            });
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn OCR sidecar: {}", e))?;

    // Write length-prefixed payload, then keep stdin open for cancel signals
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to get sidecar stdin".to_string())?;

    let payload_bytes = request_json.as_bytes();
    let length_header = format!("{}\n", payload_bytes.len());

    stdin
        .write_all(length_header.as_bytes())
        .await
        .map_err(|e| format!("Failed to write length header: {}", e))?;
    stdin
        .write_all(payload_bytes)
        .await
        .map_err(|e| format!("Failed to write payload: {}", e))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Store the job handle for external cancellation.
    // We need stdout/stderr before storing, so take them first.
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    {
        let mut job_lock = state.ocr_job.lock().await;
        *job_lock = Some(OcrJobHandle { stdin, child });
    }

    // Wait for the child to exit by polling through the stored handle
    let exit_status = {
        let wait_result = timeout(Duration::from_secs(OCR_TIMEOUT_SECS), async {
            loop {
                let mut job_lock = state.ocr_job.lock().await;
                if let Some(ref mut handle) = *job_lock {
                    match handle.child.try_wait() {
                        Ok(Some(status)) => return Ok(status),
                        Ok(None) => {
                            drop(job_lock);
                            tokio::time::sleep(Duration::from_millis(50)).await;
                        }
                        Err(e) => return Err(format!("Failed to wait for sidecar: {}", e)),
                    }
                } else {
                    // Job was cancelled externally
                    return Err("OCR job was cancelled".to_string());
                }
            }
        })
        .await;

        // Clean up job handle
        {
            let mut job_lock = state.ocr_job.lock().await;
            *job_lock = None;
        }

        match wait_result {
            Ok(Ok(status)) => status,
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                // Timeout
                eprintln!(
                    "OCR sidecar timed out after {}s, killing process",
                    OCR_TIMEOUT_SECS
                );

                {
                    let mut job_lock = state.ocr_job.lock().await;
                    if let Some(handle) = job_lock.take() {
                        cancel_job_handle(handle).await;
                    }
                }

                return Err(format!(
                    "OCR timed out after {}s. The image may be too large or complex. \
                     The process has been terminated to protect system stability.",
                    OCR_TIMEOUT_SECS
                ));
            }
        }
    };

    // Exit code 2 = cancelled by our stdin CANCEL signal
    if let Some(code) = exit_status.code() {
        if code == 2 {
            return Err("OCR job was cancelled".to_string());
        }
    }

    if !exit_status.success() {
        // Read stderr for error details
        let stderr_text = if let Some(mut pipe) = stderr_pipe {
            let mut buf = Vec::new();
            let _ = tokio::io::AsyncReadExt::read_to_end(&mut pipe, &mut buf).await;
            String::from_utf8_lossy(&buf).to_string()
        } else {
            String::new()
        };
        return Err(format!("OCR sidecar failed: {}", stderr_text));
    }

    // Read stdout for results
    let stdout_text = if let Some(mut pipe) = stdout_pipe {
        let mut buf = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut pipe, &mut buf)
            .await
            .map_err(|e| format!("Failed to read sidecar stdout: {}", e))?;
        String::from_utf8_lossy(&buf).to_string()
    } else {
        return Err("No stdout from sidecar".to_string());
    };

    if let Ok(err) = serde_json::from_str::<OcrError>(&stdout_text) {
        return Err(err.error);
    }

    let raw_results: Vec<RawOcrResult> = serde_json::from_str(&stdout_text)
        .map_err(|e| format!("Failed to parse OCR output: {} - {}", e, stdout_text))?;

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

/// Cancel the currently running OCR job.
/// Sends CANCEL to the sidecar's stdin, waits briefly, then force-kills.
/// This is fire-and-forget from the frontend's perspective.
#[tauri::command]
pub async fn cancel_ocr_job(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut job_lock = state.ocr_job.lock().await;

    if let Some(handle) = job_lock.take() {
        tokio::spawn(async move {
            cancel_job_handle(handle).await;
        });
    }

    Ok(())
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
