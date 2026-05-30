// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Image processing, clipboard, OCR execution, model management, audio playback.

use crate::services::ocr::DesktopOcrService;
use crate::state::AppState;
use squigit_memory::StoredImage;
use squigit_brain::provider::attachments::resolve_attachment_path_buf;
use squigit_ocr::ocr::{OcrBox, OcrRequest};
use tauri::{Emitter, Manager, State};

// =============================================================================
// Image Processing
// =============================================================================

#[tauri::command]
pub fn get_initial_image(state: State<AppState>) -> Option<StoredImage> {
    let image_lock = state.image_data.lock();
    image_lock.clone()
}

#[tauri::command]
pub fn process_image_path(path: String, state: State<AppState>) -> Result<StoredImage, String> {
    let stored = desktop_runtime::media::process_and_store_image(path)?;
    let mut lock = state.image_data.lock();
    *lock = Some(stored.clone());
    Ok(stored)
}

#[tauri::command]
pub fn read_image_file(path: String, state: State<AppState>) -> Result<StoredImage, String> {
    let stored = desktop_runtime::media::process_and_store_image(path)?;
    let mut lock = state.image_data.lock();
    *lock = Some(stored.clone());
    Ok(stored)
}

#[tauri::command]
pub async fn upload_image_to_imgbb(image_path: String, api_key: String) -> Result<String, String> {
    desktop_runtime::media::upload_image_to_imgbb(&image_path, &api_key).await
}

#[tauri::command]
pub fn copy_image_to_path(source_path: String, target_path: String) -> Result<(), String> {
    std::fs::copy(&source_path, &target_path).map_err(|e| e.to_string())?;
    Ok(())
}

// =============================================================================
// Clipboard
// =============================================================================

#[tauri::command]
pub async fn read_clipboard_image() -> Result<StoredImage, String> {
    desktop_runtime::media::read_and_store_clipboard_image()
}

#[tauri::command]
pub async fn read_clipboard_text() -> Result<String, String> {
    desktop_runtime::media::read_clipboard_text()
}

#[tauri::command]
pub async fn copy_image_to_clipboard(image_base64: String) -> Result<(), String> {
    desktop_runtime::media::copy_image_to_clipboard(image_base64)
}

#[tauri::command]
pub async fn copy_image_from_path_to_clipboard(path: String) -> Result<(), String> {
    desktop_runtime::media::copy_image_from_path_to_clipboard(path)
}

// =============================================================================
// OCR Execution
// =============================================================================

#[tauri::command]
pub async fn ocr_image(
    app: tauri::AppHandle,
    ocr: tauri::State<'_, DesktopOcrService>,
    image_data: String,
    is_base64: bool,
    model_name: Option<String>,
) -> Result<Vec<OcrBox>, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let (sidecar_path, runtime_dir) = ocr.resolve_sidecar_path(&resource_dir);

    if sidecar_path.is_absolute() && !sidecar_path.exists() {
        return Err("ERR_MISSING_OCR_PACKAGE".to_string());
    }

    ocr.ensure_sidecar_version_compatible(&sidecar_path)?;

    if is_base64 {
        return Err(
            "OCR sidecar is path-only. Pass a stored CAS path instead of base64 data.".to_string(),
        );
    }

    let resolved_image_path = resolve_attachment_path_buf(&image_data)?;
    let rec_model_dir_override = ocr.resolve_rec_model_dir_override(model_name.as_deref());

    let result = ocr
        .run_ocr(OcrRequest {
            sidecar_path,
            runtime_dir,
            image_path: resolved_image_path,
            rec_model_dir_override,
            timeout_secs: None,
        })
        .await?;

    Ok(result.boxes)
}

#[tauri::command]
pub async fn cancel_ocr_job(ocr: tauri::State<'_, DesktopOcrService>) -> Result<(), String> {
    ocr.cancel_ocr_job().await
}

// =============================================================================
// Model Management
// =============================================================================

#[tauri::command]
pub async fn download_ocr_model(
    state: tauri::State<'_, DesktopOcrService>,
    window: tauri::Window,
    url: String,
    model_id: String,
) -> Result<String, String> {
    println!("Downloading OCR model: {} -> {}", url, model_id);

    let path = state
        .download_model(&url, &model_id, |payload| {
            let _ = window.emit("download-progress", payload);
        })
        .await?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn cancel_download_ocr_model(
    state: tauri::State<'_, DesktopOcrService>,
    model_id: String,
) -> Result<(), String> {
    println!("Cancelling download for model: {}", model_id);
    state.cancel_model_download(&model_id);
    Ok(())
}

#[tauri::command]
pub fn list_downloaded_models(
    state: tauri::State<'_, DesktopOcrService>,
) -> Result<Vec<String>, String> {
    state.list_downloaded_models()
}

#[tauri::command]
pub fn get_model_path(
    state: tauri::State<'_, DesktopOcrService>,
    model_id: String,
) -> Result<String, String> {
    let path = state.get_model_dir(&model_id);
    if path.exists() {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err(format!("Model {} not found", model_id))
    }
}

// =============================================================================
// Audio
// =============================================================================

#[tauri::command]
pub fn play_ui_sound(
    effect: Option<String>,
    sound_player: State<'_, desktop_runtime::audio::UiSoundPlayer>,
) -> Result<(), String> {
    let parsed_effect = desktop_runtime::audio::UiSoundEffect::from_input(effect.as_deref())?;
    sound_player.play(parsed_effect)
}
