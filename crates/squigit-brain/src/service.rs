// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::context::builder::format_history_log;
use crate::events::BrainEventSink;
use crate::runtime::BrainRuntimeState;
use squigit_storage::{MessageAttachment, ThreadData, ThreadMessage, ThreadMetadata};

#[derive(Debug, Clone)]
pub struct StreamThreadRequest {
    pub api_key: String,
    pub model_candidates: Vec<String>,
    pub is_initial_turn: bool,
    pub image_path: Option<String>,
    pub image_description: Option<String>,
    pub user_first_msg: Option<String>,
    pub history_log: Option<String>,
    pub user_message: String,
    pub user_message_id: Option<String>,
    pub channel_id: String,
    pub thread_id: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GenerateThreadTitleRequest {
    pub api_key: String,
    pub model_candidates: Vec<String>,
    pub prompt_context: String,
}

#[derive(Debug, Clone)]
pub struct AnalyzeImageRequest {
    pub api_key: String,
    pub main_model_candidates: Vec<String>,
    pub micro_model_candidates: Vec<String>,
    pub image_path: String,
    pub user_message: Option<String>,
    pub channel_id: String,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AnalyzeImageResult {
    pub metadata: ThreadMetadata,
    pub assistant_message: String,
}

#[derive(Debug, Clone)]
pub struct PromptThreadRequest {
    pub api_key: String,
    pub main_model_candidates: Vec<String>,
    pub micro_model_candidates: Vec<String>,
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
    ) -> Result<String, String> {
        crate::provider::gemini::commands::thread::stream_gemini_thread_v2(
            &self.runtime,
            sink,
            request.api_key,
            request.model_candidates,
            request.is_initial_turn,
            request.image_path,
            request.image_description,
            request.user_first_msg,
            request.history_log,
            request.user_message,
            request.user_message_id,
            request.channel_id,
            request.thread_id,
            request.user_name,
            request.user_email,
        )
        .await
    }

    pub async fn generate_thread_title(
        &self,
        request: GenerateThreadTitleRequest,
    ) -> Result<String, String> {
        crate::provider::gemini::commands::generation::generate_thread_title(
            request.api_key,
            request.model_candidates,
            request.prompt_context,
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

        let mut metadata = ThreadMetadata::new("Untitled".to_string(), image.hash.clone());
        let display_name = std::path::Path::new(&request.image_path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("squigitshot.png");
        let initial = storage
            .attachment_manifest_entry(&image.hash, display_name, metadata.created_at)
            .map_err(|error| error.to_string())?;
        let thread = ThreadData::new(metadata.clone(), initial);
        storage.save_thread(&thread).map_err(|e| e.to_string())?;

        let text = request.user_message.unwrap_or_default();
        let assistant_message = self
            .stream_thread(
                sink,
                StreamThreadRequest {
                    api_key: request.api_key.clone(),
                    model_candidates: request.main_model_candidates.clone(),
                    is_initial_turn: true,
                    image_path: Some(image.path.clone()),
                    image_description: None,
                    user_first_msg: None,
                    history_log: None,
                    user_message: text.clone(),
                    user_message_id: None,
                    channel_id: request.channel_id,
                    thread_id: Some(metadata.id.clone()),
                    user_name: request.user_name,
                    user_email: request.user_email,
                },
            )
            .await?;

        if !text.trim().is_empty() {
            storage
                .append_message(&metadata.id, &ThreadMessage::user(text.clone()))
                .map_err(|e| e.to_string())?;
        }
        if !assistant_message.trim().is_empty() {
            storage
                .append_message(
                    &metadata.id,
                    &ThreadMessage::assistant(assistant_message.clone()),
                )
                .map_err(|e| e.to_string())?;
        }

        let title_context = format!("User: {}\nAssistant: {}", text, assistant_message);
        if let Ok(title) = self
            .generate_thread_title(GenerateThreadTitleRequest {
                api_key: request.api_key.clone(),
                model_candidates: request.micro_model_candidates,
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
            assistant_message,
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
        let (normalized_user_message, message_attachments) =
            normalize_prompt_message_with_at_paths(&storage, &request.user_message)?;

        let image_path = storage
            .get_image_path(&thread.metadata.image_hash)
            .map_err(|e| e.to_string())?;

        let mut history_pairs = Vec::new();
        for message in &thread.messages {
            history_pairs.push((message.role().to_string(), message.content().to_string()));
        }

        let image_description = thread
            .messages
            .iter()
            .find(|message| message.role() == "assistant")
            .map(|message| message.content().to_string())
            .unwrap_or_default();
        let user_first_msg = thread
            .messages
            .iter()
            .find(|message| message.role() == "user")
            .map(|message| message.content().to_string())
            .unwrap_or_default();

        let user_message = ThreadMessage::user_with_attachments(
            normalized_user_message.clone(),
            message_attachments,
        );
        let user_message_id = user_message.id().to_string();
        storage
            .append_message(&request.thread_id, &user_message)
            .map_err(|e| e.to_string())?;

        let assistant_message = self
            .stream_thread(
                sink,
                StreamThreadRequest {
                    api_key: request.api_key.clone(),
                    model_candidates: request.main_model_candidates.clone(),
                    is_initial_turn: false,
                    image_path: Some(image_path),
                    image_description: Some(image_description),
                    user_first_msg: Some(user_first_msg),
                    history_log: Some(format_history_log(&history_pairs)),
                    user_message: normalized_user_message.clone(),
                    user_message_id: Some(user_message_id),
                    channel_id: request.channel_id,
                    thread_id: Some(request.thread_id.clone()),
                    user_name: request.user_name,
                    user_email: request.user_email,
                },
            )
            .await?;

        storage
            .append_message(
                &request.thread_id,
                &ThreadMessage::assistant(assistant_message.clone()),
            )
            .map_err(|e| e.to_string())?;

        let mut metadata = thread.metadata;
        if metadata.title == "Untitled"
            || metadata.title == "New thread"
            || metadata.title.trim().is_empty()
        {
            let title_context = format!(
                "User: {}\nAssistant: {}",
                normalized_user_message, assistant_message
            );
            if let Ok(title) = self
                .generate_thread_title(GenerateThreadTitleRequest {
                    api_key: request.api_key.clone(),
                    model_candidates: request.micro_model_candidates.clone(),
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

fn normalize_prompt_message_with_at_paths(
    storage: &squigit_storage::ThreadStorage,
    input: &str,
) -> Result<(String, Vec<MessageAttachment>), String> {
    let mut changed = false;
    let mut attachments = Vec::new();
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
            attachments.push(MessageAttachment {
                attachment_hash: stored.hash,
                source_path: Some(raw_path.to_string()),
            });
            changed = true;
            Ok(format!("[{label}](<file://{}>)", stored.path))
        })
        .collect::<Result<Vec<_>, String>>()?
        .join(" ");

    if changed {
        Ok((normalized, attachments))
    } else {
        Ok((input.to_string(), attachments))
    }
}
