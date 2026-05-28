// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Sidecar management — STT path resolution, version checking, engine lifecycle.

use std::path::PathBuf;
pub use svc_speech_engine::{SpeechEngine, SttEvent};
use tokio::sync::mpsc::Receiver;

// =============================================================================
// STT Sidecar Resolution
// =============================================================================

pub fn resolve_stt_sidecar_path() -> Result<(PathBuf, Option<PathBuf>), String> {
    let system_cmd = if cfg!(target_os = "windows") {
        "squigit-stt.exe"
    } else {
        "squigit-stt"
    };
    if which_cmd(system_cmd) {
        return Ok((PathBuf::from(system_cmd), None));
    }

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

// =============================================================================
// STT Version Check
// =============================================================================

const REQUIRED_STT_VERSION: &str = "1.2.0";

pub fn check_stt_version(sidecar_path: &std::path::Path) -> Result<(), String> {
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

// =============================================================================
// STT Engine Lifecycle
// =============================================================================

pub async fn start_stt(
    binary_path: PathBuf,
    model: Option<String>,
    language: Option<String>,
) -> Result<(SpeechEngine, Receiver<SttEvent>), String> {
    check_stt_version(&binary_path)?;

    let model_name = model.unwrap_or_else(|| "ggml-tiny.en.bin".to_string());
    let lang = language.unwrap_or_else(|| "en".to_string());

    log::info!(
        "Starting STT: binary={:?}, model={:?}, lang={}",
        binary_path,
        model_name,
        lang
    );

    let mut engine = SpeechEngine::new(binary_path);
    let rx = engine
        .start(model_name, lang)
        .await
        .map_err(|e| format!("Failed to start engine: {}", e))?;

    Ok((engine, rx))
}
