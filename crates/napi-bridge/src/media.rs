// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Desktop media NAPI wrappers — clipboard, image processing, tone detection, audio.
//! Only compiled with --features desktop.

use crate::types::NapiStoredImage;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::Result;
use napi_derive::napi;

// =============================================================================
// Image Processing
// =============================================================================

#[napi]
pub fn process_image_path(path: String) -> Result<NapiStoredImage> {
    desktop_runtime::media::process_and_store_image(path)
        .map(Into::into)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub async fn upload_image_to_imgbb(image_path: String, api_key: String) -> Result<String> {
    desktop_runtime::media::upload_image_to_imgbb(&image_path, &api_key)
        .await
        .map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Tone Detection
// =============================================================================

#[napi]
pub fn detect_image_tone(bytes: napi::bindgen_prelude::Buffer) -> Option<String> {
    desktop_runtime::media::detect_image_tone_from_bytes(bytes.as_ref())
}

// =============================================================================
// Clipboard
// =============================================================================

#[napi]
pub fn read_clipboard_image() -> Result<NapiStoredImage> {
    desktop_runtime::media::read_and_store_clipboard_image()
        .map(Into::into)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn read_clipboard_text() -> Result<String> {
    desktop_runtime::media::read_clipboard_text().map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn copy_image_to_clipboard(image_base64: String) -> Result<()> {
    desktop_runtime::media::copy_image_to_clipboard(image_base64)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn copy_image_from_path_to_clipboard(path: String) -> Result<()> {
    desktop_runtime::media::copy_image_from_path_to_clipboard(path)
        .map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Audio (placeholder — real impl needs rodio OnceCell for persistent player)
// =============================================================================

#[napi]
pub fn play_ui_sound(effect: String) -> Result<()> {
    static PLAYER: std::sync::OnceLock<desktop_runtime::audio::UiSoundPlayer> = std::sync::OnceLock::new();
    
    let effect = desktop_runtime::audio::UiSoundEffect::from_input(Some(&effect))
        .map_err(|e| napi::Error::from_reason(e))?;
        
    let player = PLAYER.get_or_init(|| desktop_runtime::audio::UiSoundPlayer::new());
    
    player.play(effect).map_err(|e| napi::Error::from_reason(e))?;
    Ok(())
}

#[napi]
pub async fn ocr_image(image_path: String, _is_base64: bool, _model_name: String) -> Result<String> {
    let current_exe = std::env::current_exe().unwrap_or_default();
    let resource_dir = current_exe.parent().unwrap_or(std::path::Path::new(""));
    let (sidecar_path, runtime_dir) = squigit_ocr::sidecar::resolve_sidecar_path(resource_dir);

    // Let's prepare OcrRequest
    let request = squigit_ocr::ocr::OcrRequest {
        sidecar_path,
        runtime_dir,
        image_path: std::path::PathBuf::from(image_path),
        rec_model_dir_override: None, // Or logic to map model_name if needed
        timeout_secs: None,
    };

    let runtime = squigit_ocr::ocr::OcrRuntime::new();
    let result = runtime.run(request).await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(result.raw_json)
}

// =============================================================================
// OCR Model Downloader
// =============================================================================

static MODEL_MANAGER: std::sync::OnceLock<squigit_ocr::models::ModelManager> = std::sync::OnceLock::new();

fn get_model_manager() -> Result<&'static squigit_ocr::models::ModelManager> {
    if MODEL_MANAGER.get().is_none() {
        let m = squigit_ocr::models::ModelManager::new()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        m.start_monitor();
        let _ = MODEL_MANAGER.set(m);
    }
    Ok(MODEL_MANAGER.get().unwrap())
}

#[napi]
pub async fn download_ocr_model(
    model_id: String,
    url: String,
    #[napi(ts_arg_type = "(progressJson: string) => void")] progress_cb: ThreadsafeFunction<String>,
) -> Result<String> {
    let manager = get_model_manager()?;
    let path = manager.download_and_extract(&url, &model_id, move |payload| {
        let json_str = serde_json::to_string(&payload).unwrap_or_default();
        progress_cb.call(Ok(json_str), ThreadsafeFunctionCallMode::NonBlocking);
    }).await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
    
    Ok(path.to_string_lossy().to_string())
}

#[napi]
pub fn cancel_download_ocr_model(model_id: String) -> Result<()> {
    let manager = get_model_manager()?;
    manager.cancel_download(&model_id);
    Ok(())
}

#[napi]
pub fn list_downloaded_models() -> Result<Vec<String>> {
    let manager = get_model_manager()?;
    manager.list_downloaded_models().map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn get_model_path(model_id: String) -> Result<String> {
    let manager = get_model_manager()?;
    Ok(manager.get_model_dir(&model_id).to_string_lossy().to_string())
}
