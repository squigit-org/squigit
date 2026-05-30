// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Brain streaming + speech-to-text.

use std::sync::Arc;
use crate::services::brain::DesktopBrainService;
use squigit_brain::service::{
    CompressConversationRequest, GenerateChatTitleRequest, GenerateImageBriefRequest,
    StreamChatRequest,
};
use desktop_runtime::sidecar::SttEvent;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

// =============================================================================
// Brain Streaming
// =============================================================================

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn stream_chat(
    app: AppHandle,
    brain: State<'_, DesktopBrainService>,
    api_key: String,
    model: String,
    is_initial_turn: bool,
    image_path: Option<String>,
    image_description: Option<String>,
    user_first_msg: Option<String>,
    history_log: Option<String>,
    rolling_summary: Option<String>,
    user_message: String,
    channel_id: String,
    chat_id: Option<String>,
    user_name: Option<String>,
    user_email: Option<String>,
    user_instruction: Option<String>,
    image_brief: Option<String>,
) -> Result<(), String> {
    brain
        .stream_chat(
            app,
            StreamChatRequest {
                api_key,
                model,
                is_initial_turn,
                image_path,
                image_description,
                user_first_msg,
                history_log,
                rolling_summary,
                user_message,
                channel_id,
                chat_id,
                user_name,
                user_email,
                user_instruction,
                image_brief,
            },
        )
        .await
}

#[tauri::command]
pub async fn generate_chat_title(
    brain: State<'_, DesktopBrainService>,
    api_key: String,
    model: String,
    prompt_context: String,
) -> Result<String, String> {
    brain
        .generate_chat_title(GenerateChatTitleRequest {
            api_key,
            model,
            prompt_context,
        })
        .await
}

#[tauri::command]
pub async fn generate_image_brief(
    brain: State<'_, DesktopBrainService>,
    api_key: String,
    image_path: String,
    model: Option<String>,
) -> Result<String, String> {
    brain
        .generate_image_brief(GenerateImageBriefRequest {
            api_key,
            image_path,
            model: model.unwrap_or_else(|| crate::constants::DEFAULT_MODEL.to_string()),
        })
        .await
}

#[tauri::command]
pub async fn compress_conversation(
    brain: State<'_, DesktopBrainService>,
    api_key: String,
    image_brief: String,
    history_to_compress: String,
    model: Option<String>,
) -> Result<String, String> {
    brain
        .compress_conversation(CompressConversationRequest {
            api_key,
            image_brief,
            history_to_compress,
            model: model.unwrap_or_else(|| crate::constants::DEFAULT_MODEL.to_string()),
        })
        .await
}

#[tauri::command]
pub async fn cancel_request(
    brain: State<'_, DesktopBrainService>,
    channel_id: Option<String>,
) -> Result<(), String> {
    brain.cancel_request(channel_id).await
}

#[tauri::command]
pub async fn quick_answer_request(
    brain: State<'_, DesktopBrainService>,
    channel_id: String,
) -> Result<(), String> {
    brain.quick_answer_request(channel_id).await
}

// =============================================================================
// Speech-to-Text
// =============================================================================

pub struct SpeechState {
    pub engine: Arc<Mutex<Option<desktop_runtime::sidecar::SpeechEngine>>>,
}

impl Default for SpeechState {
    fn default() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
        }
    }
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

    let (binary_path, _) = desktop_runtime::sidecar::resolve_stt_sidecar_path()?;

    let (engine, mut rx) =
        desktop_runtime::sidecar::start_stt(binary_path, model, language).await?;
    *engine_guard = Some(engine);

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
