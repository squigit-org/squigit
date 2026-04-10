// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Speech-to-text Tauri commands
//!
//! Exposes start_stt/stop_stt to frontend, streaming events via window.emit("stt_event")

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use svc_speech_engine::{SpeechEngine, SttEvent};

/// Shared speech engine state
pub struct SpeechState {
    pub engine: Arc<Mutex<Option<SpeechEngine>>>,
}

impl Default for SpeechState {
    fn default() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
        }
    }
}

#[allow(dead_code)]
pub fn resolve_sidecar_path(_app: &AppHandle) -> Result<(PathBuf, Option<PathBuf>), String> {
    let system_cmd = if cfg!(target_os = "windows") {
        "squigit-stt.exe"
    } else {
        "squigit-stt"
    };
    if which_cmd(system_cmd) {
        return Ok((PathBuf::from(system_cmd), None));
    }

    // macOS GUI Fallback
    #[cfg(target_os = "macos")]
    {
        let brew_arm = std::path::PathBuf::from("/opt/homebrew/bin/squigit-stt");
        let brew_intel = std::path::PathBuf::from("/usr/local/bin/squigit-stt");
        if brew_arm.exists() {
            return Ok((brew_arm, None));
        }
        if brew_intel.exists() {
            return Ok((brew_intel, None));
        }
    }

    // Windows GUI (Winget) Fallback
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let winget_path = std::path::PathBuf::from(local_app_data)
                .join("Microsoft")
                .join("WindowsApps")
                .join("squigit-stt.exe");
            if winget_path.exists() {
                return Ok((winget_path, None));
            }
        }
    }

    // Dev mode fallback
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(target_dir) = current_exe.parent().and_then(|p| p.parent()) {
            let host_triple = if cfg!(target_os = "windows") {
                "x86_64-pc-windows-msvc"
            } else if cfg!(target_os = "macos") {
                "aarch64-apple-darwin"
            } else {
                "x86_64-unknown-linux-gnu"
            };

            let debug_runtime = target_dir
                .join("debug")
                .join("binaries")
                .join(format!("whisper-stt-{}", host_triple));
            let debug_candidate = debug_runtime.join(system_cmd);
            if debug_candidate.exists() {
                return Ok((debug_candidate, Some(debug_runtime)));
            }
        }
    }

    Err("ERR_MISSING_STT_PACKAGE".to_string())
}

fn which_cmd(cmd: &str) -> bool {
    if let Ok(path) = std::env::var("PATH") {
        for p in std::env::split_paths(&path) {
            let exe = p.join(cmd);
            if exe.exists() {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
pub async fn start_stt(
    app: AppHandle,
    state: State<'_, SpeechState>,
    model: Option<String>,
    language: Option<String>,
) -> Result<(), String> {
    let mut engine_guard = state.engine.lock().await;

    if engine_guard.is_some() {
        return Err("STT already running".to_string());
    }

    let (binary_path, _) = resolve_sidecar_path(&app)?;

    // Version locking
    check_stt_version(&binary_path)?;

    let model_name = model.unwrap_or_else(|| "ggml-tiny.en.bin".to_string());
    let lang = language.unwrap_or_else(|| "en".to_string());

    log::info!(
        "Starting STT: binary={:?}, model={:?}, lang={}",
        binary_path,
        model_name,
        lang
    );

    // Create and start engine
    let mut engine = SpeechEngine::new(binary_path);
    let mut rx = engine
        .start(model_name, lang)
        .await
        .map_err(|e| format!("Failed to start engine: {}", e))?;

    *engine_guard = Some(engine);

    // Spawn event forwarding task
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            let payload = match &event {
                SttEvent::Transcription { text, is_final } => {
                    serde_json::json!({
                        "type": "transcription",
                        "text": text,
                        "is_final": is_final
                    })
                }
                SttEvent::Status { status } => {
                    serde_json::json!({
                        "type": "status",
                        "status": status
                    })
                }
                SttEvent::Error { message } => {
                    serde_json::json!({
                        "type": "error",
                        "message": message
                    })
                }
            };

            if let Err(e) = app_handle.emit("stt_event", payload) {
                log::error!("Failed to emit stt_event: {}", e);
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_stt(state: State<'_, SpeechState>) -> Result<(), String> {
    let mut engine_guard = state.engine.lock().await;

    if let Some(mut engine) = engine_guard.take() {
        engine
            .stop()
            .await
            .map_err(|e| format!("Failed to stop engine: {}", e))?;
    }

    Ok(())
}

const REQUIRED_STT_VERSION: &str = "1.2.0";

fn check_stt_version(sidecar_path: &std::path::Path) -> Result<(), String> {
    let output = std::process::Command::new(sidecar_path)
        .arg("--version")
        .output()
        .map_err(|_| "ERR_MISSING_STT_PACKAGE".to_string())?;

    if !output.status.success() {
        return Err("ERR_MISSING_STT_PACKAGE".to_string());
    }

    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed: Vec<u32> = version_str
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    let req: Vec<u32> = REQUIRED_STT_VERSION
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();

    if parsed.len() == 3 && req.len() == 3 {
        // Strict lock logic: Major must act as lock, minor/patch >=
        if parsed[0] != req[0] || parsed[1] < req[1] || (parsed[1] == req[1] && parsed[2] < req[2])
        {
            return Err("ERR_OUTDATED_STT_PACKAGE".to_string());
        }
        return Ok(());
    }

    if version_str != REQUIRED_STT_VERSION {
        return Err("ERR_OUTDATED_STT_PACKAGE".to_string());
    }

    Ok(())
}
