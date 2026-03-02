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
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;
use tauri::Manager;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

use crate::services::models::ModelManager;
use crate::state::{AppState, OcrJobHandle};

/// Maximum wall-clock time for a single OCR job (seconds).
const OCR_TIMEOUT_SECS_DEFAULT: u64 = 120;

/// Global mutex to ensure only one OCR job runs at a time.
/// Prevents concurrent calls from compounding CPU pressure.
static OCR_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn get_ocr_timeout_secs() -> u64 {
    std::env::var("SNAPLLM_OCR_TIMEOUT_SECS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(OCR_TIMEOUT_SECS_DEFAULT)
}

fn prepend_env_path(cmd: &mut tokio::process::Command, key: &str, path: &Path, sep: &str) {
    let prepend_value = path.to_string_lossy().to_string();
    let current = std::env::var(key).ok();

    let merged = match current {
        Some(existing) if !existing.is_empty() => {
            let already_present = existing.split(sep).any(|entry| entry == prepend_value);
            if already_present {
                existing
            } else {
                format!("{}{}{}", prepend_value, sep, existing)
            }
        }
        _ => prepend_value,
    };

    cmd.env(key, merged);
}

fn apply_runtime_lib_env(cmd: &mut tokio::process::Command, runtime_dir: Option<&Path>) {
    let Some(runtime_dir) = runtime_dir else {
        return;
    };

    if !runtime_dir.is_dir() {
        return;
    }

    #[cfg(windows)]
    {
        prepend_env_path(cmd, "PATH", runtime_dir, ";");
        let paddle_lib_dir = runtime_dir.join("paddle").join("libs");
        if paddle_lib_dir.is_dir() {
            prepend_env_path(cmd, "PATH", &paddle_lib_dir, ";");
        }
    }

    #[cfg(target_os = "linux")]
    {
        prepend_env_path(cmd, "PATH", runtime_dir, ":");
        let paddle_lib_dir = runtime_dir.join("paddle").join("libs");
        if paddle_lib_dir.is_dir() {
            prepend_env_path(cmd, "LD_LIBRARY_PATH", &paddle_lib_dir, ":");
            prepend_env_path(cmd, "PATH", &paddle_lib_dir, ":");
        }
    }

    #[cfg(target_os = "macos")]
    {
        prepend_env_path(cmd, "PATH", runtime_dir, ":");
        let paddle_lib_dir = runtime_dir.join("paddle").join("libs");
        if paddle_lib_dir.is_dir() {
            prepend_env_path(cmd, "DYLD_LIBRARY_PATH", &paddle_lib_dir, ":");
            prepend_env_path(cmd, "PATH", &paddle_lib_dir, ":");
        }
    }
}

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

async fn read_pipe_to_string(pipe: Option<tokio::process::ChildStdout>) -> String {
    if let Some(mut pipe) = pipe {
        let mut buf = Vec::new();
        let _ = pipe.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).to_string()
    } else {
        String::new()
    }
}

async fn read_stderr_to_string(pipe: Option<tokio::process::ChildStderr>) -> String {
    if let Some(mut pipe) = pipe {
        let mut buf = Vec::new();
        let _ = pipe.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).to_string()
    } else {
        String::new()
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
    let ocr_timeout_secs = get_ocr_timeout_secs();

    let state = app.state::<AppState>();

    // Cancel any lingering previous job (defensive)
    {
        let mut job_lock = state.ocr_job.lock().await;
        if let Some(old_handle) = job_lock.take() {
            cancel_job_handle(old_handle).await;
        }
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    let (sidecar_path, runtime_dir) = resolve_sidecar_path(&resource_dir);

    if !sidecar_path.exists() {
        return Err(format!("OCR sidecar not found at: {:?}", sidecar_path));
    }

    #[cfg(debug_assertions)]
    {
        if let Some(ref dir) = runtime_dir {
            eprintln!("OCR runtime dir: {}", dir.display());
        }
        eprintln!("OCR sidecar executable: {}", sidecar_path.display());
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
    if let Some(ref dir) = runtime_dir {
        cmd.current_dir(dir);
    }

    cmd.env("OMP_NUM_THREADS", "1")
        .env("OPENBLAS_NUM_THREADS", "1")
        .env("MKL_NUM_THREADS", "1")
        .env("NUMEXPR_NUM_THREADS", "1")
        .env("OMP_WAIT_POLICY", "PASSIVE");
    apply_runtime_lib_env(&mut cmd, runtime_dir.as_deref());

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
        let wait_result = timeout(Duration::from_secs(ocr_timeout_secs), async {
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
                    ocr_timeout_secs
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
                    ocr_timeout_secs
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

    // Always collect both streams so error reporting can include stdout JSON payloads.
    let stdout_text = read_pipe_to_string(stdout_pipe).await;
    let stderr_text = read_stderr_to_string(stderr_pipe).await;

    if !exit_status.success() {
        if let Ok(err) = serde_json::from_str::<OcrError>(&stdout_text) {
            return Err(format!("OCR sidecar failed: {}", err.error));
        }

        let stderr_trimmed = stderr_text.trim();
        let stdout_trimmed = stdout_text.trim();

        if !stderr_trimmed.is_empty() && !stdout_trimmed.is_empty() {
            return Err(format!(
                "OCR sidecar failed: {}\n{}",
                stderr_trimmed, stdout_trimmed
            ));
        }
        if !stderr_trimmed.is_empty() {
            return Err(format!("OCR sidecar failed: {}", stderr_trimmed));
        }
        if !stdout_trimmed.is_empty() {
            return Err(format!("OCR sidecar failed: {}", stdout_trimmed));
        }
        return Err("OCR sidecar failed with no error output".to_string());
    }

    if stdout_text.is_empty() {
        return Err("No stdout from sidecar".to_string());
    }

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

fn get_target_triple() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(target_os = "macos")]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(target_os = "linux")]
    {
        "x86_64-unknown-linux-gnu"
    }
}

fn get_sidecar_executable_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ocr-engine.exe"
    }
    #[cfg(target_os = "macos")]
    {
        "ocr-engine"
    }
    #[cfg(target_os = "linux")]
    {
        "ocr-engine"
    }
}

fn get_legacy_sidecar_name() -> String {
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

fn get_runtime_dir_name() -> String {
    format!("paddle-ocr-{}", get_target_triple())
}

fn resolve_sidecar_path(resource_dir: &Path) -> (PathBuf, Option<PathBuf>) {
    let runtime_dir_name = get_runtime_dir_name();
    let runtime_candidates = [
        resource_dir.join("binaries").join(&runtime_dir_name),
        resource_dir.join(&runtime_dir_name),
        resource_dir
            .join("resources")
            .join("binaries")
            .join(&runtime_dir_name),
    ];

    for runtime_dir in runtime_candidates {
        let sidecar = runtime_dir.join(get_sidecar_executable_name());
        if sidecar.exists() {
            return (sidecar, Some(runtime_dir));
        }
    }

    // Backward-compatible fallback for legacy onefile/externalBin builds.
    let legacy_name = get_legacy_sidecar_name();
    let legacy_candidates = [
        resource_dir.join("binaries").join(&legacy_name),
        resource_dir.join(&legacy_name),
    ];
    for sidecar in legacy_candidates {
        if sidecar.exists() {
            return (sidecar, None);
        }
    }

    (
        resource_dir.join("binaries").join(legacy_name),
        Some(resource_dir.join("binaries").join(runtime_dir_name)),
    )
}
