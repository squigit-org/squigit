// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Desktop media NAPI wrappers — clipboard, image processing, tone detection, audio.
//! Only compiled with --features desktop.

use napi::Result;
use napi_derive::napi;
use crate::types::NapiStoredImage;

// =============================================================================
// Image Processing
// =============================================================================

#[napi]
pub fn process_image_path(path: String) -> Result<NapiStoredImage> {
    ops_host_runtime::media::process_and_store_image(path)
        .map(Into::into)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub async fn upload_image_to_imgbb(image_path: String, api_key: String) -> Result<String> {
    ops_host_runtime::media::upload_image_to_imgbb(&image_path, &api_key)
        .await
        .map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Tone Detection
// =============================================================================

#[napi]
pub fn detect_image_tone(bytes: napi::bindgen_prelude::Buffer) -> Option<String> {
    ops_host_runtime::media::detect_image_tone_from_bytes(bytes.as_ref())
}

// =============================================================================
// Clipboard
// =============================================================================

#[napi]
pub fn read_clipboard_image() -> Result<NapiStoredImage> {
    ops_host_runtime::media::read_and_store_clipboard_image()
        .map(Into::into)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn read_clipboard_text() -> Result<String> {
    ops_host_runtime::media::read_clipboard_text()
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn copy_image_to_clipboard(image_base64: String) -> Result<()> {
    ops_host_runtime::media::copy_image_to_clipboard(image_base64)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn copy_image_from_path_to_clipboard(path: String) -> Result<()> {
    ops_host_runtime::media::copy_image_from_path_to_clipboard(path)
        .map_err(|e| napi::Error::from_reason(e))
}

// =============================================================================
// Audio (placeholder — real impl needs rodio OnceCell for persistent player)
// =============================================================================

#[napi]
pub fn play_ui_sound(effect: String) -> Result<()> {
    let _effect = ops_host_runtime::audio::UiSoundEffect::from_input(Some(&effect))
        .map_err(|e| napi::Error::from_reason(e))?;
    // TODO: Use a static OnceCell<UiSoundPlayer> to persist the rodio stream.
    // For now this is a stub — Electron will implement audio differently.
    Ok(())
}
