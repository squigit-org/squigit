// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use ops_chat_storage::{ChatStorage, StoredImage};
use crate::state::AppState;

/// Read image from clipboard and store in CAS.
/// Returns StoredImage { hash, path }.
#[tauri::command]
pub async fn read_clipboard_image(_state: State<'_, AppState>) -> Result<StoredImage, String> {
    use arboard::Clipboard;
    use image::ImageEncoder;

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    let image_data = clipboard
        .get_image()
        .map_err(|e| format!("Failed to get image from clipboard: {}", e))?;

    let img = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(
        image_data.width as u32,
        image_data.height as u32,
        image_data.bytes.into_owned(),
    )
    .ok_or("Failed to create image buffer")?;

    let mut buffer = Vec::new();
    let cursor = std::io::Cursor::new(&mut buffer);

    image::codecs::png::PngEncoder::new(cursor)
        .write_image(
            &img,
            image_data.width as u32,
            image_data.height as u32,
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    // Store in CAS instead of base64 encoding
    let storage = ChatStorage::new().map_err(|e| e.to_string())?;
    let stored = storage.store_image(&buffer).map_err(|e| e.to_string())?;

    Ok(stored)
}

/// Read text from clipboard.
#[tauri::command]
pub async fn read_clipboard_text() -> Result<String, String> {
    use arboard::Clipboard;

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .get_text()
        .map_err(|e| format!("Failed to get text from clipboard: {}", e))
}

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

#[tauri::command]
pub async fn copy_image_to_clipboard(image_base64: String) -> Result<(), String> {
    use arboard::{Clipboard, ImageData};
    use base64::Engine;

    // Decode base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let img_data = ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    };

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    clipboard
        .set_image(img_data)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn copy_image_from_path_to_clipboard(path: String) -> Result<(), String> {
    use clipboard_rs::{Clipboard, ClipboardContext};

    let ctx = ClipboardContext::new()
        .map_err(|e| format!("Failed to create clipboard context: {}", e))?;

    let files = vec![path];
    ctx.set_files(files)
        .map_err(|e| format!("Failed to copy files: {}", e))?;

    Ok(())
}
