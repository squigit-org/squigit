// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Desktop media NAPI wrappers — clipboard, image processing, tone detection, audio.
//! Only compiled with --features desktop.

use crate::types::NapiStoredImage;
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
    let _effect = desktop_runtime::audio::UiSoundEffect::from_input(Some(&effect))
        .map_err(|e| napi::Error::from_reason(e))?;
    // TODO: Use a static OnceCell<UiSoundPlayer> to persist the rodio stream.
    // For now this is a stub — Electron will implement audio differently.
    Ok(())
}

#[napi]
pub async fn ocr_image(image_path: String, _is_base64: bool, model_name: String) -> Result<String> {
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
