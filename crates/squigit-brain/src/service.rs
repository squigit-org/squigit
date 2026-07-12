// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::context::builder::format_history_log;
use crate::provider::gemini::transport::types::GeminiEvent;
use crate::events::BrainEventSink;
use crate::runtime::BrainRuntimeState;
use squigit_storage::{ThreadData, ThreadMessage, ThreadMetadata, StoredImage};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct StreamThreadRequest {
    pub api_key: String,
    pub model: String,
    pub is_initial_turn: bool,
    pub image_path: Option<String>,
    pub image_description: Option<String>,
    pub user_first_msg: Option<String>,
    pub history_log: Option<String>,
    pub user_message: String,
    pub channel_id: String,
    pub thread_id: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub image_brief: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GenerateThreadTitleRequest {
    pub api_key: String,
    pub model: String,
    pub prompt_context: String,
}

#[derive(Debug, Clone)]
pub struct GenerateImageBriefRequest {
    pub api_key: String,
    pub image_path: String,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct AnalyzeImageRequest {
    pub api_key: String,
    pub model: String,
    pub image_path: String,
    pub user_message: Option<String>,
    pub channel_id: String,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub ocr_lang: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AnalyzeImageResult {
    pub metadata: ThreadMetadata,
    pub image: StoredImage,
    pub assistant_message: String,
    pub image_brief: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PromptThreadRequest {
    pub api_key: String,
    pub model: String,
    pub thread_id: String,
    pub user_message: String,
    pub channel_id: String,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PromptThreadResult {
    pub thread_id: String,
    pub assistant_message: String,
    pub normalized_user_message: String,
}

pub struct BrainService {
    runtime: BrainRuntimeState,
}

impl BrainService {
    pub fn new() -> Self {
        Self {
            runtime: BrainRuntimeState::new(),
        }
    }

    pub fn runtime(&self) -> &BrainRuntimeState {
        &self.runtime
    }

    pub async fn stream_thread(
        &self,
        sink: &dyn BrainEventSink,
        request: StreamThreadRequest,
    ) -> Result<(), String> {
        crate::provider::gemini::commands::thread::stream_gemini_thread_v2(
            &self.runtime,
            sink,
            request.api_key,
            request.model,
            request.is_initial_turn,
            request.image_path,
            request.image_description,
            request.user_first_msg,
            request.history_log,
            request.user_message,
            request.channel_id,
            request.thread_id,
            request.user_name,
            request.user_email,
            request.image_brief,
        )
        .await
    }

    pub async fn generate_thread_title(
        &self,
        request: GenerateThreadTitleRequest,
    ) -> Result<String, String> {
        crate::provider::gemini::commands::generation::generate_thread_title(
            request.api_key,
            request.model,
            request.prompt_context,
        )
        .await
    }

    pub async fn generate_image_brief(
        &self,
        request: GenerateImageBriefRequest,
    ) -> Result<String, String> {
        crate::provider::gemini::commands::generation::generate_image_brief(
            &self.runtime,
            request.api_key,
            request.image_path,
            request.model,
        )
        .await
    }

    pub async fn cancel_request(&self, channel_id: Option<String>) -> Result<(), String> {
        crate::provider::gemini::agent::request_control::cancel_gemini_request(
            &self.runtime,
            channel_id,
        )
        .await
    }

    pub async fn request_quick_answer(&self, channel_id: String) -> Result<(), String> {
        crate::provider::gemini::agent::request_control::answer_now_gemini_request(
            &self.runtime,
            channel_id,
        )
        .await
    }

    pub async fn analyze_image(
        &self,
        sink: &dyn BrainEventSink,
        request: AnalyzeImageRequest,
    ) -> Result<AnalyzeImageResult, String> {
        let image = crate::context::media::process_and_store_image(&request.image_path, None)?;
        let storage = crate::context::media::get_active_storage()?;

        let mut metadata = ThreadMetadata::new(
            "Untitled".to_string(),
            image.hash.clone(),
            request.ocr_lang.clone(),
        );
        metadata.image_tone = storage.get_image_tone(&image.hash);
        let thread = ThreadData::new(metadata.clone());
        storage.save_thread(&thread).map_err(|e| e.to_string())?;

        let text = request.user_message.unwrap_or_default();
        let collector = CollectingEventSink::new(Some(sink));
        self.stream_thread(
            &collector,
            StreamThreadRequest {
                api_key: request.api_key.clone(),
                model: request.model.clone(),
                is_initial_turn: true,
                image_path: Some(image.path.clone()),
                image_description: None,
                user_first_msg: None,
                history_log: None,
                user_message: text.clone(),
                channel_id: request.channel_id,
                thread_id: Some(metadata.id.clone()),
                user_name: request.user_name,
                user_email: request.user_email,
                image_brief: None,
            },
        )
        .await?;

        let assistant_message = collector.current_text();

        if !text.trim().is_empty() {
            storage
                .append_message(&metadata.id, &ThreadMessage::user(text.clone()))
                .map_err(|e| e.to_string())?;
        }
        if !assistant_message.trim().is_empty() {
            storage
                .append_message(&metadata.id, &ThreadMessage::assistant(assistant_message.clone()))
                .map_err(|e| e.to_string())?;
        }

        let api_key = request.api_key.clone();

        let image_brief = self
            .generate_image_brief(GenerateImageBriefRequest {
                api_key: api_key.clone(),
                image_path: image.path.clone(),
                model: request.model.clone(),
            })
            .await
            .ok()
            .filter(|value| !value.trim().is_empty());

        if let Some(brief) = image_brief.as_ref() {
            let _ = storage.save_image_brief(&metadata.id, brief);
        }

        let title_context = format!("User: {}\nAssistant: {}", text, assistant_message);
        if let Ok(title) = self
            .generate_thread_title(GenerateThreadTitleRequest {
                api_key,
                model: request.model,
                prompt_context: title_context,
            })
            .await
        {
            let trimmed = title.trim();
            if !trimmed.is_empty() {
                metadata.title = trimmed.to_string();
                let _ = storage.update_thread_metadata(&metadata);
            }
        }

        Ok(AnalyzeImageResult {
            metadata,
            image,
            assistant_message,
            image_brief,
        })
    }

    pub async fn prompt_thread(
        &self,
        sink: &dyn BrainEventSink,
        request: PromptThreadRequest,
    ) -> Result<PromptThreadResult, String> {
        let storage = crate::context::media::get_active_storage()?;
        let thread = storage
            .load_thread(&request.thread_id)
            .map_err(|e| e.to_string())?;
        let normalized_user_message =
            normalize_prompt_message_with_at_paths(&storage, &request.user_message)?;

        let image_path = storage
            .get_image_path(&thread.metadata.image_hash)
            .map_err(|e| e.to_string())?;

        let mut history_pairs = Vec::new();
        for message in &thread.messages {
            history_pairs.push((message.role.clone(), message.content.clone()));
        }

        let image_description = thread
            .messages
            .iter()
            .find(|message| message.role == "assistant")
            .map(|message| message.content.clone())
            .unwrap_or_default();
        let user_first_msg = thread
            .messages
            .iter()
            .find(|message| message.role == "user")
            .map(|message| message.content.clone())
            .unwrap_or_default();

        let collector = CollectingEventSink::new(Some(sink));
        self.stream_thread(
            &collector,
            StreamThreadRequest {
                api_key: request.api_key.clone(),
                model: request.model.clone(),
                is_initial_turn: false,
                image_path: Some(image_path),
                image_description: Some(image_description),
                user_first_msg: Some(user_first_msg),
                history_log: Some(format_history_log(&history_pairs)),
                user_message: normalized_user_message.clone(),
                channel_id: request.channel_id,
                thread_id: Some(request.thread_id.clone()),
                user_name: request.user_name,
                user_email: request.user_email,
                image_brief: thread.image_brief.clone(),
            },
        )
        .await?;

        let assistant_message = collector.current_text();

        storage
            .append_message(
                &request.thread_id,
                &ThreadMessage::user(normalized_user_message.clone()),
            )
            .map_err(|e| e.to_string())?;
        storage
            .append_message(
                &request.thread_id,
                &ThreadMessage::assistant(assistant_message.clone()),
            )
            .map_err(|e| e.to_string())?;

        let mut metadata = thread.metadata;
        if metadata.title == "Untitled" || metadata.title == "New thread" || metadata.title.trim().is_empty() {
            let title_context = format!("User: {}\nAssistant: {}", normalized_user_message, assistant_message);
            if let Ok(title) = self
                .generate_thread_title(GenerateThreadTitleRequest {
                    api_key: request.api_key.clone(),
                    model: request.model.clone(),
                    prompt_context: title_context,
                })
                .await
            {
                let trimmed = title.trim();
                if !trimmed.is_empty() {
                    metadata.title = trimmed.to_string();
                    let _ = storage.update_thread_metadata(&metadata);
                }
            }
        }

        Ok(PromptThreadResult {
            thread_id: request.thread_id,
            assistant_message,
            normalized_user_message,
        })
    }
}

impl Default for BrainService {
    fn default() -> Self {
        Self::new()
    }
}

struct CollectingEventSink<'a> {
    delegate: Option<&'a dyn BrainEventSink>,
    text: Arc<Mutex<String>>,
}

impl<'a> CollectingEventSink<'a> {
    fn new(delegate: Option<&'a dyn BrainEventSink>) -> Self {
        Self {
            delegate,
            text: Arc::new(Mutex::new(String::new())),
        }
    }

    fn current_text(&self) -> String {
        self.text
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default()
    }
}

impl BrainEventSink for CollectingEventSink<'_> {
    fn emit(&self, channel_id: &str, event: GeminiEvent) {
        if let Ok(mut text) = self.text.lock() {
            match &event {
                GeminiEvent::Token { token } => text.push_str(token),
                GeminiEvent::Reset => text.clear(),
                _ => {}
            }
        }

        if let Some(delegate) = self.delegate {
            delegate.emit(channel_id, event);
        }
    }
}

fn normalize_prompt_message_with_at_paths(
    storage: &squigit_storage::ThreadStorage,
    input: &str,
) -> Result<String, String> {
    let mut changed = false;
    let normalized = input
        .split_whitespace()
        .map(|token| {
            let Some(raw_path) = token.strip_prefix('@') else {
                return Ok(token.to_string());
            };

            if raw_path.is_empty() {
                return Ok(token.to_string());
            }

            let path = std::path::Path::new(raw_path);
            if !path.is_absolute() || !path.is_file() {
                return Ok(token.to_string());
            }

            let stored = storage
                .store_file_from_path(raw_path, None)
                .map_err(|e| e.to_string())?;
            let label = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("attachment");
            changed = true;
            Ok(format!("[{}](<{}>)", label, stored.path))
        })
        .collect::<Result<Vec<_>, String>>()?
        .join(" ");

    if changed {
        Ok(normalized)
    } else {
        Ok(input.to_string())
    }
}
