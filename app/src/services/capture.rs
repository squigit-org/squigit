// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Screen capture service.
//!
//! Spawns the `capture-engine` sidecar, reads its IPC protocol
//! (CHAT_ID + DISPLAY_GEO), then shows the main window centered
//! on the monitor where the capture took place.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use tauri::{AppHandle, Emitter, Manager};
pub fn spawn_capture(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || match run_capture(&handle) {
        Ok(result) => {
            if let (Some(window), Some(geo)) =
                (handle.get_webview_window("main"), result.display_geo)
            {
                let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize {
                    width: 1030,
                    height: 690,
                });

                let center_x = geo.x + (geo.w as i32 - win_size.width as i32) / 2;
                let center_y = geo.y + (geo.h as i32 - win_size.height as i32) / 2;

                let _ = window.set_position(tauri::PhysicalPosition::new(center_x, center_y));
                let _ = window.show();
                let _ = window.set_focus();
            }

            let payload = serde_json::json!({
                "chatId": result.chat_id,
                "imageHash": result.image_hash,
            });
            let _ = handle.emit("capture-complete", payload);
        }
        Err(e) => {
            eprintln!("[capture] Failed: {}", e);
        }
    });
}

struct CaptureResult {
    chat_id: String,
    image_hash: String,
    display_geo: Option<DisplayGeo>,
}

#[derive(Debug, Clone)]
struct DisplayGeo {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

fn run_capture(app: &AppHandle) -> Result<CaptureResult, String> {
    let sidecar_path = resolve_sidecar_path(app)?;

    let mut args = Vec::new();
    let mut is_freeshape = false;

    if let Ok(config_dir) = app.path().app_config_dir() {
        let prefs_path = config_dir.join("preferences.json");
        if let Ok(contents) = std::fs::read_to_string(&prefs_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(capture_type) = json.get("captureType").and_then(|v| v.as_str()) {
                    if capture_type == "squiggle" {
                        is_freeshape = true;
                    }
                }
            }
        }
    }

    if is_freeshape {
        args.push("-f".to_string());
    } else {
        args.push("-r".to_string());
    }

    let mut child = Command::new(&sidecar_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to spawn capture sidecar: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get capture sidecar stdout".to_string())?;

    let reader = BufReader::new(stdout);
    let mut chat_id: Option<String> = None;
    let mut image_hash: Option<String> = None;
    let mut display_geo: Option<DisplayGeo> = None;

    for line in reader.lines() {
        match line {
            Ok(msg) => {
                let trimmed = msg.trim();
                if let Some(id) = trimmed.strip_prefix("CHAT_ID:") {
                    chat_id = Some(id.to_string());
                } else if let Some(hash) = trimmed.strip_prefix("IMAGE_HASH:") {
                    image_hash = Some(hash.to_string());
                } else if let Some(geo_str) = trimmed.strip_prefix("DISPLAY_GEO:") {
                    display_geo = parse_display_geo(geo_str);
                } else if !trimmed.is_empty() {
                    eprintln!("[capture] {}", trimmed);
                }
            }
            Err(_) => break,
        }
    }

    let _ = child.wait();

    let chat_id = chat_id.ok_or_else(|| "Capture sidecar did not return CHAT_ID".to_string())?;
    let image_hash = image_hash.unwrap_or_default();

    Ok(CaptureResult {
        chat_id,
        image_hash,
        display_geo,
    })
}

fn parse_display_geo(s: &str) -> Option<DisplayGeo> {
    let parts: Vec<&str> = s.split(',').collect();
    if parts.len() == 4 {
        Some(DisplayGeo {
            x: parts[0].parse().ok()?,
            y: parts[1].parse().ok()?,
            w: parts[2].parse().ok()?,
            h: parts[3].parse().ok()?,
        })
    } else {
        None
    }
}

fn resolve_sidecar_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let prod_path = resource_dir.join("binaries").join(get_sidecar_name());
        if prod_path.exists() {
            return Ok(prod_path);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(root) = exe
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
        {
            let dev_path = root
                .join("sidecars")
                .join("qt-capture")
                .join("target")
                .join("release")
                .join("capture-engine");
            if dev_path.exists() {
                return Ok(dev_path);
            }

            let debug_path = root
                .join("sidecars")
                .join("qt-capture")
                .join("target")
                .join("debug")
                .join("capture-engine");
            if debug_path.exists() {
                return Ok(debug_path);
            }
        }
    }

    Err(format!(
        "Capture sidecar not found. Searched production and dev locations for: {}",
        get_sidecar_name()
    ))
}

fn get_sidecar_name() -> String {
    #[cfg(target_os = "windows")]
    {
        "capture-engine.exe".to_string()
    }
    #[cfg(target_os = "macos")]
    {
        "capture-engine".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "capture-engine-x86_64-unknown-linux-gnu".to_string()
    }
}
