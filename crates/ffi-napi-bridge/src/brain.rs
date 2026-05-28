// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::str::FromStr;
use std::sync::OnceLock;
use napi::{Error, Result};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use ops_profile_store::ProfileStore;
use ops_profile_store::security::{get_decrypted_key, ApiKeyProvider};
use ops_squigit_brain::events::BrainEventSink;
use ops_squigit_brain::provider::gemini::transport::types::GeminiEvent;
use ops_squigit_brain::service::{
    AnalyzeImageRequest, BrainService, CompressConversationRequest, GenerateChatTitleRequest,
    GenerateImageBriefRequest, PromptChatRequest, StreamChatRequest,
};

use crate::types::{NapiAnalyzeResult, NapiPromptResult, NapiStreamEvent};

static BRAIN_SERVICE: OnceLock<BrainService> = OnceLock::new();

fn get_brain_service() -> &'static BrainService {
    BRAIN_SERVICE.get_or_init(BrainService::new)
}

struct NapiEventSink {
    tsfn: ThreadsafeFunction<NapiStreamEvent>,
}

impl BrainEventSink for NapiEventSink {
    fn emit(&self, _channel_id: &str, event: GeminiEvent) {
        let napi_event: NapiStreamEvent = event.into();
        self.tsfn.call(Ok(napi_event), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

fn active_google_api_key() -> Result<String> {
    let store = ProfileStore::new().map_err(|e| Error::from_reason(e.to_string()))?;
    let active_id = store
        .get_active_profile_id()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .ok_or_else(|| Error::from_reason("No active profile. Sign in first."))?;

    let provider = ApiKeyProvider::from_str("google ai studio")
        .map_err(|e| Error::from_reason(e.to_string()))?;
    
    let key = get_decrypted_key(&store, provider, &active_id)
        .map_err(|e| Error::from_reason(e.to_string()))?
        .unwrap_or_default();

    if key.trim().is_empty() {
        return Err(Error::from_reason("Missing Google AI Studio API key for active profile."));
    }

    Ok(key)
}

#[napi]
pub async fn analyze_image(
    image_path: String,
    model: String,
    user_message: Option<String>,
    #[napi(ts_arg_type = "(err: null | Error, event: NapiStreamEvent) => void")]
    on_event: ThreadsafeFunction<NapiStreamEvent>,
) -> Result<NapiAnalyzeResult> {
    let api_key = active_google_api_key()?;
    let service = get_brain_service();
    let sink = NapiEventSink { tsfn: on_event };

    let request = AnalyzeImageRequest {
        api_key,
        model,
        image_path,
        user_message,
        channel_id: format!("cli-analyze-{}", chrono::Utc::now().timestamp_millis()),
        user_name: None,
        user_email: None,
        user_instruction: None,
        ocr_lang: None,
    };

    let result = service.analyze_image(&sink, request).await
        .map_err(|e| Error::from_reason(e.to_string()))?;

    Ok(NapiAnalyzeResult {
        chat_id: result.metadata.id,
        title: result.metadata.title,
        assistant_message: result.assistant_message,
        image_path: result.image.path,
        image_brief: result.image_brief,
    })
}

#[napi]
pub async fn prompt_chat(
    chat_id: String,
    model: String,
    user_message: String,
    #[napi(ts_arg_type = "(err: null | Error, event: NapiStreamEvent) => void")]
    on_event: ThreadsafeFunction<NapiStreamEvent>,
) -> Result<NapiPromptResult> {
    let api_key = active_google_api_key()?;
    let service = get_brain_service();
    let sink = NapiEventSink { tsfn: on_event };

    let request = PromptChatRequest {
        api_key,
        model,
        chat_id,
        user_message,
        channel_id: format!("cli-prompt-{}", chrono::Utc::now().timestamp_millis()),
        user_name: None,
        user_email: None,
    };

    let result = service.prompt_chat(&sink, request).await
        .map_err(|e| Error::from_reason(e.to_string()))?;

    Ok(NapiPromptResult {
        chat_id: result.chat_id,
        assistant_message: result.assistant_message,
        normalized_user_message: result.normalized_user_message,
    })
}

#[napi]
#[allow(clippy::too_many_arguments)]
pub async fn stream_chat(
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
    #[napi(ts_arg_type = "(err: null | Error, event: NapiStreamEvent) => void")]
    on_event: ThreadsafeFunction<NapiStreamEvent>,
) -> Result<()> {
    let service = get_brain_service();
    let sink = NapiEventSink { tsfn: on_event };

    let request = StreamChatRequest {
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
    };

    service.stream_chat(&sink, request).await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub async fn generate_chat_title(
    api_key: String,
    model: String,
    prompt_context: String,
) -> Result<String> {
    let service = get_brain_service();
    let request = GenerateChatTitleRequest { api_key, model, prompt_context };
    service.generate_chat_title(request).await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub async fn generate_image_brief(
    api_key: String,
    image_path: String,
    model: String,
) -> Result<String> {
    let service = get_brain_service();
    let request = GenerateImageBriefRequest { api_key, image_path, model };
    service.generate_image_brief(request).await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub async fn compress_conversation(
    api_key: String,
    image_brief: String,
    history_to_compress: String,
    model: String,
) -> Result<String> {
    let service = get_brain_service();
    let request = CompressConversationRequest { api_key, image_brief, history_to_compress, model };
    service.compress_conversation(request).await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub async fn cancel_request(channel_id: Option<String>) -> Result<()> {
    let service = get_brain_service();
    service.cancel_request(channel_id).await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub async fn request_quick_answer(channel_id: String) -> Result<()> {
    let service = get_brain_service();
    service.request_quick_answer(channel_id).await
        .map_err(|e| Error::from_reason(e.to_string()))
}
