// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Error, Result};
use napi_derive::napi;
use squigit_brain::events::BrainEventSink;
use squigit_brain::provider::gemini::transport::types::GeminiEvent;
use squigit_brain::service::{
    BrainService, GenerateImageBriefRequest, GenerateThreadTitleRequest, StreamThreadRequest,
};
use std::sync::OnceLock;

use crate::types::NapiStreamEvent;

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
        self.tsfn
            .call(Ok(napi_event), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

#[napi(js_name = "stream_thread")]
#[allow(clippy::too_many_arguments)]
pub async fn stream_thread(
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
    thread_id: Option<String>,
    user_name: Option<String>,
    user_email: Option<String>,
    image_brief: Option<String>,
    #[napi(ts_arg_type = "(err: null | Error, event: NapiStreamEvent) => void")]
    on_event: ThreadsafeFunction<NapiStreamEvent>,
) -> Result<()> {
    let service = get_brain_service();
    let sink = NapiEventSink { tsfn: on_event };

    let request = StreamThreadRequest {
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
        thread_id,
        user_name,
        user_email,
        image_brief,
    };

    service
        .stream_thread(&sink, request)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi(js_name = "generate_thread_title")]
pub async fn generate_thread_title(
    api_key: String,
    model: String,
    prompt_context: String,
) -> Result<String> {
    let service = get_brain_service();
    let request = GenerateThreadTitleRequest {
        api_key,
        model,
        prompt_context,
    };
    service
        .generate_thread_title(request)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi(js_name = "generate_image_brief")]
pub async fn generate_image_brief(
    api_key: String,
    image_path: String,
    model: String,
) -> Result<String> {
    let service = get_brain_service();
    let request = GenerateImageBriefRequest {
        api_key,
        image_path,
        model,
    };
    service
        .generate_image_brief(request)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi(js_name = "cancel_request")]
pub async fn cancel_request(channel_id: Option<String>) -> Result<()> {
    let service = get_brain_service();
    service
        .cancel_request(channel_id)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi(js_name = "request_quick_answer")]
pub async fn request_quick_answer(channel_id: String) -> Result<()> {
    let service = get_brain_service();
    service
        .request_quick_answer(channel_id)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))
}
