// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Error, Result};
use napi_derive::napi;
use squigit_brain::events::BrainEventSink;
use squigit_brain::provider::gemini::transport::types::GeminiEvent;
use squigit_brain::service::{BrainService, GenerateThreadTitleRequest, StreamThreadRequest};
use squigit_brain::{PrepareAttachmentRequest, PrepareSubmissionAttachmentsRequest};
use std::sync::OnceLock;

use crate::types::NapiStreamEvent;

static BRAIN_SERVICE: OnceLock<BrainService> = OnceLock::new();

fn get_brain_service() -> &'static BrainService {
    BRAIN_SERVICE.get_or_init(BrainService::new)
}

struct NapiEventSink {
    tsfn: ThreadsafeFunction<NapiStreamEvent, bool>,
}

impl BrainEventSink for NapiEventSink {
    fn emit(&self, _channel_id: &str, event: GeminiEvent) {
        let napi_event: NapiStreamEvent = event.into();
        self.tsfn
            .call(Ok(napi_event), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

impl NapiEventSink {
    async fn flush(&self) -> Result<()> {
        self.tsfn
            .call_async(Ok(NapiStreamEvent::complete()))
            .await
            .map(|_| ())
    }
}

#[napi(js_name = "stream_thread")]
#[allow(clippy::too_many_arguments)]
pub async fn stream_thread(
    api_key: String,
    model_candidates: Vec<String>,
    is_initial_turn: bool,
    image_path: Option<String>,
    image_description: Option<String>,
    user_first_msg: Option<String>,
    history_log: Option<String>,
    user_message: String,
    user_message_id: Option<String>,
    attachment_preflight_token: Option<String>,
    channel_id: String,
    thread_id: Option<String>,
    user_name: Option<String>,
    user_email: Option<String>,
    #[napi(ts_arg_type = "(err: null | Error, event: NapiStreamEvent) => boolean")]
    on_event: ThreadsafeFunction<NapiStreamEvent, bool>,
) -> Result<String> {
    let service = get_brain_service();
    let sink = NapiEventSink { tsfn: on_event };

    let request = StreamThreadRequest {
        api_key,
        model_candidates,
        is_initial_turn,
        image_path,
        image_description,
        user_first_msg,
        history_log,
        user_message,
        user_message_id,
        attachment_preflight_token,
        channel_id,
        thread_id,
        user_name,
        user_email,
    };

    let final_text = service
        .stream_thread(&sink, request)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;
    sink.flush().await?;
    Ok(final_text)
}

#[napi(js_name = "prepare_attachment")]
pub async fn prepare_attachment(job_id: String, source_path: String) -> Result<String> {
    let result = get_brain_service()
        .prepare_attachment(PrepareAttachmentRequest {
            job_id,
            source_path,
        })
        .await;
    serde_json::to_string(&result).map_err(|error| Error::from_reason(error.to_string()))
}

#[napi(js_name = "cancel_attachment")]
pub async fn cancel_attachment(job_id: String) -> Result<()> {
    get_brain_service()
        .cancel_attachment(job_id)
        .await
        .map_err(Error::from_reason)
}

#[napi(js_name = "cancel_all_attachment_jobs")]
pub async fn cancel_all_attachment_jobs() -> Result<()> {
    get_brain_service()
        .cancel_all_attachment_jobs()
        .await
        .map_err(Error::from_reason)
}

#[napi(js_name = "prepare_submission_attachments")]
pub async fn prepare_submission_attachments(
    preflight_id: String,
    thread_id: String,
    user_message_id: String,
    attachment_hashes: Vec<String>,
) -> Result<String> {
    let result = get_brain_service()
        .prepare_submission_attachments(PrepareSubmissionAttachmentsRequest {
            preflight_id,
            thread_id,
            user_message_id,
            attachment_hashes,
        })
        .await;
    serde_json::to_string(&result).map_err(|error| Error::from_reason(error.to_string()))
}

#[napi(js_name = "generate_thread_title")]
pub async fn generate_thread_title(
    api_key: String,
    model_candidates: Vec<String>,
    prompt_context: String,
) -> Result<String> {
    let service = get_brain_service();
    let request = GenerateThreadTitleRequest {
        api_key,
        model_candidates,
        prompt_context,
    };
    service
        .generate_thread_title(request)
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
