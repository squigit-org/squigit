/*
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

#[tauri::command]
pub async fn start_clipboard_watcher(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if state.watcher_running.load(Ordering::SeqCst) {
        state.watcher_running.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(500));
    }

    state.watcher_running.store(true, Ordering::SeqCst);
    let running_flag = state.watcher_running.clone();
    let app_handle = app.clone();

    thread::spawn(move || {
        let mut clipboard = loop {
            match arboard::Clipboard::new() {
                Ok(cb) => break cb,
                Err(e) => {
                    eprintln!("Clipboard init failed, retrying in 1s: {}", e);
                    if !running_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    thread::sleep(Duration::from_secs(1));
                }
            }
        };

        let mut last_text = clipboard.get_text().unwrap_or_default().trim().to_string();
        println!("Watcher started. Ignoring current clipboard content.");

        while running_flag.load(Ordering::SeqCst) {
            if let Ok(text) = clipboard.get_text() {
                let trimmed = text.trim().to_string();

                if !trimmed.is_empty() && trimmed != last_text {
                    last_text = trimmed.clone();

                    if trimmed.starts_with("AIzaS") {
                        println!("Gemini Key Detected");
                        let _ = app_handle.emit(
                            "clipboard-text",
                            serde_json::json!({ "provider": "gemini", "key": trimmed }),
                        );
                    } else if trimmed.len() == 32 && trimmed.chars().all(char::is_alphanumeric) {
                        println!("ImgBB Key Detected");
                        let _ = app_handle.emit(
                            "clipboard-text",
                            serde_json::json!({ "provider": "imgbb", "key": trimmed }),
                        );
                    }
                }
            }
            thread::sleep(Duration::from_millis(2000));
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_clipboard_watcher(state: State<'_, AppState>) -> Result<(), String> {
    state.watcher_running.store(false, Ordering::SeqCst);
    Ok(())
}
