// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde_json::json;
use squigit_storage::{ThreadMessage, ThreadStorage};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::events::BrainEventSink;
use crate::provider::gemini::agent::request_control::{
    register_request, remove_request, GeminiRequestControl,
};
use crate::provider::gemini::agent::tool_dispatch::{
    dispatch_tool_call, is_supported_tool_name, ToolDispatchContext, WebToolDispatchState,
};
use crate::provider::gemini::agent::tool_orchestrator::{
    build_system_instruction_with_tool_policy, tool_status_text, tool_step_id,
};
use crate::provider::gemini::attachments::{
    build_attachment_manifest_context, build_interleaved_parts, load_attachment_display_names,
    prepare_turn_attachments, ActiveKeyIdentity,
};
use crate::provider::gemini::fallback::{is_candidate_retryable_error, is_transport_error};
use crate::provider::gemini::request_log::{write_request_log, GeminiRequestLogContext};
use crate::provider::gemini::transport::streaming::{
    emit_event, stream_request_iteration, StreamIterationResult,
};
use crate::provider::gemini::transport::types::{
    GeminiContent, GeminiEvent, GeminiFileData, GeminiFunctionResponse, GeminiPart, GeminiRequest,
};
use crate::runtime::BrainRuntimeState;

const DEFAULT_INITIAL_USER_PROMPT: &str =
    "Analyze this image and explain it or discuss fixes about the issue it describes.";
const INITIAL_THREAD_TITLE_RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(60);

fn is_initial_thread_title_generation_eligible(
    thread_id: &str,
    file_uri: &str,
) -> Result<bool, String> {
    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    let thread = storage
        .load_thread(thread_id)
        .map_err(|error| error.to_string())?;
    let manifest = storage
        .load_object_manifest(&thread.metadata.image_hash)
        .map_err(|error| error.to_string())?;
    let remote_is_persisted = manifest
        .object_remotes
        .values()
        .any(|remote| remote.file_uri == file_uri);
    Ok(
        thread.metadata.title == squigit_storage::DEFAULT_THREAD_TITLE
            && thread.messages.is_empty()
            && remote_is_persisted,
    )
}

fn persist_generated_thread_title(thread_id: &str, title: &str) -> Result<(), String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Thread title generation returned an empty title".to_string());
    }

    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    let mut metadata = storage
        .load_thread(thread_id)
        .map_err(|error| error.to_string())?
        .metadata;

    if metadata.title != squigit_storage::DEFAULT_THREAD_TITLE {
        return Ok(());
    }

    metadata.title = trimmed.to_string();
    storage
        .update_thread_metadata(&metadata)
        .map_err(|error| error.to_string())
}

async fn generate_initial_thread_title_once(
    api_key: String,
    model_candidates: Vec<String>,
    thread_id: String,
    file_ref: crate::provider::gemini::attachments::GeminiFileRef,
) -> Result<(), String> {
    let title = crate::provider::gemini::commands::generation::generate_thread_title_from_image(
        api_key,
        model_candidates,
        file_ref.file_uri,
        file_ref.mime_type,
    )
    .await?;
    persist_generated_thread_title(&thread_id, &title)
}

fn spawn_initial_thread_title_generation(
    api_key: String,
    model_candidates: Vec<String>,
    thread_id: String,
    file_ref: crate::provider::gemini::attachments::GeminiFileRef,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(error) = generate_initial_thread_title_once(
            api_key.clone(),
            model_candidates.clone(),
            thread_id.clone(),
            file_ref.clone(),
        )
        .await
        {
            eprintln!("[ThreadTitle] Initial generation failed for {thread_id}: {error}");
            tokio::spawn(async move {
                tokio::time::sleep(INITIAL_THREAD_TITLE_RETRY_DELAY).await;
                if let Err(retry_error) = generate_initial_thread_title_once(
                    api_key,
                    model_candidates,
                    thread_id.clone(),
                    file_ref,
                )
                .await
                {
                    eprintln!(
                        "[ThreadTitle] Background retry failed for {thread_id}: {retry_error}"
                    );
                }
            });
        }
    })
}

fn strip_visual_citation_payloads(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            map.remove("favicon_url");
            map.remove("favicon_base64");
            for child in map.values_mut() {
                strip_visual_citation_payloads(child);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                strip_visual_citation_payloads(item);
            }
        }
        _ => {}
    }
}

fn model_safe_tool_response(value: &serde_json::Value) -> serde_json::Value {
    let mut safe = value.clone();
    strip_visual_citation_payloads(&mut safe);
    safe
}

fn normalize_attachment_lookup_key(path: &str) -> String {
    let trimmed = path.trim();
    trimmed
        .strip_prefix('<')
        .and_then(|value| value.strip_suffix('>'))
        .map(str::trim)
        .unwrap_or(trimmed)
        .to_string()
}

fn attachment_lookup_aliases(path: &str) -> Vec<String> {
    let mut aliases = Vec::<String>::new();
    let mut push_unique = |value: String| {
        if !value.is_empty() && !aliases.iter().any(|existing| existing == &value) {
            aliases.push(value);
        }
    };

    let normalized = normalize_attachment_lookup_key(path);
    push_unique(normalized.clone());

    let normalized_without_current_dir = normalized
        .strip_prefix("./")
        .map(str::to_string)
        .unwrap_or_else(|| normalized.clone());
    push_unique(normalized_without_current_dir.clone());

    let normalized_path = Path::new(&normalized);
    if let Some(file_name) = normalized_path.file_name().and_then(|value| value.to_str()) {
        push_unique(file_name.to_string());
    }
    if let Some(stem) = normalized_path.file_stem().and_then(|value| value.to_str()) {
        push_unique(stem.to_string());
    }

    if let Ok(canonical) =
        crate::provider::gemini::attachments::paths::resolve_attachment_path_internal(&normalized)
    {
        let canonical_str = canonical.to_string_lossy().to_string();
        push_unique(canonical_str.clone());

        let canonical_path = Path::new(&canonical_str);
        if let Some(file_name) = canonical_path.file_name().and_then(|value| value.to_str()) {
            push_unique(file_name.to_string());
        }
        if let Some(stem) = canonical_path.file_stem().and_then(|value| value.to_str()) {
            push_unique(stem.to_string());
        }
    }

    aliases
}

fn is_unfriendly_attachment_name(value: &str) -> bool {
    let file_name = Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(value)
        .trim();
    if file_name.is_empty() {
        return true;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(file_name)
        .trim();

    stem.len() >= 16 && stem.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn insert_attachment_display_name(
    map: &mut HashMap<String, String>,
    path: &str,
    display_name: &str,
) {
    let register_alias = |map: &mut HashMap<String, String>, alias: String, display_name: &str| {
        if alias.is_empty() {
            return;
        }
        match map.get(&alias) {
            Some(existing) if !is_unfriendly_attachment_name(existing) => {}
            _ => {
                map.insert(alias, display_name.to_string());
            }
        }
    };

    for alias in attachment_lookup_aliases(path) {
        register_alias(map, alias, display_name);
    }

    for alias in attachment_lookup_aliases(display_name) {
        register_alias(map, alias, display_name);
    }
}

fn find_attachment_display_name<'a>(
    path: &str,
    map: &'a HashMap<String, String>,
) -> Option<&'a str> {
    for alias in attachment_lookup_aliases(path) {
        if let Some(value) = map.get(&alias) {
            return Some(value.as_str());
        }
    }
    None
}

fn tool_attachment_lookup_value(
    function_call: &crate::provider::gemini::transport::types::GeminiFunctionCall,
) -> Option<&str> {
    function_call
        .args
        .get("path")
        .and_then(|value| value.as_str())
        .or_else(|| {
            function_call
                .args
                .get("target")
                .and_then(|value| value.as_str())
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn append_final_tool_answer_instruction(contents: &mut Vec<GeminiContent>, reason: &str) {
    let mut instruction =
        "Use the tool result(s) above to answer the user's latest message now.\n\
         - Start with the direct answer in a human-friendly way.\n\
         - Use the sources/tool data as evidence, but do not return only source chips or tool metadata.\n\
         - If the tool result is incomplete or conflicting, say that clearly and answer with the available evidence."
            .to_string();

    let trimmed_reason = reason.trim();
    if !trimmed_reason.is_empty() {
        instruction.push_str("\n\nReason for this final pass: ");
        instruction.push_str(trimmed_reason);
    }

    contents.push(GeminiContent {
        role: "user".to_string(),
        parts: vec![GeminiPart {
            text: Some(instruction),
            ..Default::default()
        }],
    });
}

/// Retry only interrupted transports against the same active candidate.
async fn stream_iteration_with_transport_retry(
    sink: &dyn BrainEventSink,
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    request_body: &GeminiRequest,
    channel_id: &str,
    cancel_token: &tokio_util::sync::CancellationToken,
) -> Result<StreamIterationResult, String> {
    const MAX_TRANSPORT_RETRIES: usize = 2;

    let mut transport_retries = 0usize;

    loop {
        match stream_request_iteration(
            sink,
            client,
            url,
            api_key,
            request_body,
            channel_id,
            cancel_token,
        )
        .await
        {
            Ok(result) => return Ok(result),
            Err(err) => {
                if is_transport_error(&err) && transport_retries < MAX_TRANSPORT_RETRIES {
                    transport_retries += 1;
                    emit_event(
                        sink,
                        channel_id,
                        GeminiEvent::Debug {
                            phase: "transport.retry".to_string(),
                            message: "Retrying the active model after a transport interruption"
                                .to_string(),
                            payload: Some(json!({
                                "attempt": transport_retries,
                                "maximum": MAX_TRANSPORT_RETRIES,
                                "error": err,
                            })),
                        },
                    );
                    emit_event(
                        sink,
                        channel_id,
                        GeminiEvent::ToolStatus {
                            message: format!(
                                "Connection hiccup, retrying ({}/{})",
                                transport_retries, MAX_TRANSPORT_RETRIES
                            ),
                        },
                    );
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_millis(750 * transport_retries as u64)) => {},
                        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
                    }
                    emit_event(sink, channel_id, GeminiEvent::Reset { clear_tools: false });
                    continue;
                }
                return Err(err);
            }
        }
    }
}

struct CandidateTrackingSink<'a> {
    delegate: &'a dyn BrainEventSink,
    tool_result_produced: &'a AtomicBool,
}

impl BrainEventSink for CandidateTrackingSink<'_> {
    fn emit(&self, channel_id: &str, event: GeminiEvent) {
        if matches!(&event, GeminiEvent::ToolEnd { .. }) {
            self.tool_result_produced.store(true, Ordering::Relaxed);
        }
        self.delegate.emit(channel_id, event);
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn stream_gemini_thread_v2(
    runtime: &BrainRuntimeState,
    sink: &dyn BrainEventSink,
    identity: ActiveKeyIdentity,
    model_candidates: Vec<String>,
    micro_model_candidates: Option<Vec<String>>,
    is_initial_turn: bool,
    image_path: Option<String>,
    image_description: Option<String>,
    user_first_msg: Option<String>,
    history_log: Option<String>,
    user_message: String,
    user_message_id: Option<String>,
    channel_id: String,
    thread_id: Option<String>,
    user_name: Option<String>,
    user_email: Option<String>,
    attachment_preflight_token: Option<String>,
    force_web_search: bool,
) -> Result<String, String> {
    if model_candidates.is_empty() {
        return Err("At least one model candidate is required.".to_string());
    }

    let mut identity = identity;
    let preflight_files = if let Some(token) = attachment_preflight_token.as_deref() {
        if is_initial_turn {
            return Err(
                "Attachment preflight tokens are only valid for follow-up turns".to_string(),
            );
        }
        let (Some(thread_id), Some(message_id)) =
            (thread_id.as_deref(), user_message_id.as_deref())
        else {
            return Err(
                "Attachment preflight requires a thread and exact user message ID".to_string(),
            );
        };
        let storage = squigit_storage::ThreadStorage::new().map_err(|error| error.to_string())?;
        let message = storage
            .get_message(thread_id, message_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("User message not found: {message_id}"))?;
        let ThreadMessage::User { attachments, .. } = message else {
            return Err(format!("Message is not a user message: {message_id}"));
        };
        let hashes = attachments
            .into_iter()
            .map(|attachment| attachment.attachment_hash)
            .collect::<Vec<_>>();
        let consumed = crate::provider::gemini::attachments::consume_attachment_preflight(
            runtime,
            token,
            Some(thread_id),
            Some(message_id),
            &hashes,
        )
        .await?;
        identity = consumed.identity;
        Some(consumed.files_by_hash)
    } else {
        None
    };

    emit_event(
        sink,
        &channel_id,
        GeminiEvent::Debug {
            phase: "request.queued".to_string(),
            message: "Preparing the Gemini prompt".to_string(),
            payload: Some(json!({
                "modelCandidates": model_candidates,
                "initialTurn": is_initial_turn,
                "forceWebSearch": force_web_search,
            })),
        },
    );

    let mut last_error = "All model candidates failed.".to_string();
    for (index, model) in model_candidates.iter().enumerate() {
        emit_event(
            sink,
            &channel_id,
            GeminiEvent::Debug {
                phase: "candidate.start".to_string(),
                message: "Starting Gemini model candidate".to_string(),
                payload: Some(json!({
                    "model": model,
                    "position": index + 1,
                    "total": model_candidates.len(),
                })),
            },
        );
        let tool_result_produced = AtomicBool::new(false);
        let tracking_sink = CandidateTrackingSink {
            delegate: sink,
            tool_result_produced: &tool_result_produced,
        };
        let title_candidates = if index == 0 {
            micro_model_candidates.clone()
        } else {
            None
        };
        let result = stream_gemini_thread_candidate(
            runtime,
            &tracking_sink,
            identity.clone(),
            model.clone(),
            title_candidates,
            is_initial_turn,
            image_path.clone(),
            image_description.clone(),
            user_first_msg.clone(),
            history_log.clone(),
            user_message.clone(),
            user_message_id.clone(),
            channel_id.clone(),
            thread_id.clone(),
            user_name.clone(),
            user_email.clone(),
            preflight_files.clone(),
            force_web_search,
        )
        .await;

        match result {
            Ok(answer) => {
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::Debug {
                        phase: "candidate.complete".to_string(),
                        message: "Gemini model candidate completed".to_string(),
                        payload: Some(json!({ "model": model })),
                    },
                );
                return Ok(answer);
            }
            Err(error) => {
                let has_next = index + 1 < model_candidates.len();
                let retryable = is_candidate_retryable_error(&error);
                let may_switch =
                    has_next && !tool_result_produced.load(Ordering::Relaxed) && retryable;
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::Debug {
                        phase: "candidate.failed".to_string(),
                        message: if may_switch {
                            "Candidate failed; advancing immediately"
                        } else {
                            "Candidate failed"
                        }
                        .to_string(),
                        payload: Some(json!({
                            "model": model,
                            "error": error,
                            "retryable": retryable,
                            "willAdvance": may_switch,
                        })),
                    },
                );
                last_error = error;
                if !may_switch {
                    return Err(last_error);
                }
                emit_event(sink, &channel_id, GeminiEvent::Reset { clear_tools: true });
            }
        }
    }

    Err(last_error)
}

#[allow(clippy::too_many_arguments)]
async fn stream_gemini_thread_candidate(
    runtime: &BrainRuntimeState,
    sink: &dyn BrainEventSink,
    identity: ActiveKeyIdentity,
    model: String,
    micro_model_candidates: Option<Vec<String>>,
    is_initial_turn: bool,
    // Initial turn params
    image_path: Option<String>,
    // Subsequent turn params
    image_description: Option<String>,
    user_first_msg: Option<String>,
    history_log: Option<String>,
    // Current user message (empty on first turn for image-only analysis)
    user_message: String,
    user_message_id: Option<String>,
    channel_id: String,
    thread_id: Option<String>,
    // Runtime context params (NEW)
    user_name: Option<String>,
    user_email: Option<String>,
    preflight_files: Option<HashMap<String, crate::provider::gemini::attachments::GeminiFileRef>>,
    force_web_search: bool,
) -> Result<String, String> {
    const MAX_TOOL_CALLS_PER_TURN: usize = 3;
    const MAX_AGENT_ITERATIONS: usize = 8;
    const MAX_OUTPUT_TOKENS: usize = 65_536;
    let api_key = identity.api_key().to_owned();

    let mut title_task = None;
    let result = async {
        let client = reqwest::Client::new();
        let model_id = model.strip_prefix("models/").unwrap_or(&model);
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{model_id}:streamGenerateContent?alt=sse"
        );

        let request_control = GeminiRequestControl::new();
        register_request(runtime, channel_id.clone(), request_control.clone()).await;

        let mut allow_tools = !is_initial_turn;
        let mut force_web_search_pending = force_web_search && allow_tools;
        let mut tool_calls = 0usize;
        let mut consecutive_tool_failures = 0usize;
        let mut final_tool_answer_prompt_added = false;
        let mut attachment_display_name_by_path = HashMap::<String, String>::new();
        let tool_declarations = if allow_tools {
            Some(crate::context::loader::load_gemini_tool_declarations()?)
        } else {
            None
        };
        let mut web_tool_state = WebToolDispatchState::default();

        // Build conversation contents once; then append tool call/response turns as needed.
        let mut contents: Vec<GeminiContent> = if is_initial_turn {
            let system_prompt = crate::context::builder::build_initial_system_prompt()?;
            let mut parts = vec![];

            if let Some(path) = image_path.clone() {
                let file_ref = crate::provider::gemini::attachments::ensure_file_uploaded_for_identity(
                    runtime,
                    &identity,
                    &path,
                    &tokio_util::sync::CancellationToken::new(),
                )
                .await?
                .file_ref;
                if let (Some(thread_id), Some(title_candidates)) =
                    (thread_id.as_deref(), micro_model_candidates.as_ref())
                {
                    if !title_candidates.is_empty()
                        && tokio::task::spawn_blocking({
                            let thread_id = thread_id.to_string();
                            let file_uri = file_ref.file_uri.clone();
                            move || {
                                is_initial_thread_title_generation_eligible(&thread_id, &file_uri)
                            }
                        })
                        .await
                        .map_err(|error| format!("Thread title eligibility task failed: {error}"))??
                    {
                        title_task = Some(spawn_initial_thread_title_generation(
                            api_key.clone(),
                            title_candidates.clone(),
                            thread_id.to_string(),
                            file_ref.clone(),
                        ));
                    }
                }
                parts.push(GeminiPart {
                    file_data: Some(GeminiFileData {
                        mime_type: file_ref.mime_type.clone(),
                        file_uri: file_ref.file_uri.clone(),
                    }),
                    ..Default::default()
                });
            } else {
                return Err("image_path required for initial turn".to_string());
            }

            parts.push(GeminiPart {
                text: Some(system_prompt),
                ..Default::default()
            });
            if let Some(manifest_context) =
                build_attachment_manifest_context(thread_id.as_deref())?
            {
                parts.push(GeminiPart {
                    text: Some(manifest_context),
                    ..Default::default()
                });
            }

            let initial_user_message = if user_message.trim().is_empty() {
                DEFAULT_INITIAL_USER_PROMPT.to_string()
            } else {
                user_message.clone()
            };
            let interleaved_parts =
                build_interleaved_parts(runtime, &initial_user_message, &api_key).await?;
            parts.extend(interleaved_parts);

            vec![GeminiContent {
                role: "user".to_string(),
                parts,
            }]
        } else {
            let img_desc =
                image_description.ok_or("image_description required for subsequent turns")?;
            let first_msg = user_first_msg.unwrap_or_default();
            let history = history_log.unwrap_or_default();
            let mut context_prompt = crate::context::builder::build_turn_context(
                &img_desc, &first_msg, &history,
            );

            let composed_user_message = user_message.clone();
            for (hash, display_name) in load_attachment_display_names(thread_id.as_deref())? {
                insert_attachment_display_name(
                    &mut attachment_display_name_by_path,
                    &hash,
                    &display_name,
                );
            }
            let prepared_attachments = prepare_turn_attachments(
                runtime,
                thread_id.as_deref(),
                user_message_id.as_deref(),
                &api_key,
                preflight_files.as_ref(),
            )
            .await?;

            if let Some(manifest_context) =
                build_attachment_manifest_context(thread_id.as_deref())?
            {
                context_prompt.push_str("\n\n");
                context_prompt.push_str(&manifest_context);
            }

            let mut parts = vec![
                GeminiPart {
                    text: Some(context_prompt),
                    ..Default::default()
                },
                GeminiPart {
                    text: Some(composed_user_message),
                    ..Default::default()
                },
            ];
            parts.extend(prepared_attachments.uploaded_parts);

            vec![GeminiContent {
                role: "user".to_string(),
                parts,
            }]
        };

        for iter in 0..MAX_AGENT_ITERATIONS {
            if allow_tools && request_control.is_answer_now_requested() {
                allow_tools = false;
                force_web_search_pending = false;
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::ToolStatus {
                        message: "Wrapping up with what I have so far".to_string(),
                    },
                );
            }

            let tools = if allow_tools {
                Some(
                    tool_declarations
                        .as_ref()
                        .ok_or_else(|| "Tool declarations not loaded".to_string())?
                        .clone(),
                )
            } else {
                None
            };

            let mut sys_instruction = build_system_instruction_with_tool_policy(
                user_name.as_deref().unwrap_or(""),
                user_email.as_deref().unwrap_or(""),
                allow_tools,
            )?;
            if force_web_search_pending {
                sys_instruction.push_str(
                    "\n\nWeb search is enabled for this turn. Call `web_search` with a query \
                     derived from the current user request before answering.",
                );
            }
            let system_instruction = Some(GeminiContent {
                role: "user".to_string(),
                parts: vec![GeminiPart {
                    text: Some(sys_instruction),
                    ..Default::default()
                }],
            });

            let request_body = GeminiRequest {
                system_instruction,
                contents: contents.clone(),
                generation_config: Some(json!({
                    "maxOutputTokens": MAX_OUTPUT_TOKENS
                })),
                tools,
                tool_config: if allow_tools {
                    Some(if force_web_search_pending {
                        json!({
                            "functionCallingConfig": {
                                "mode": "ANY",
                                "allowedFunctionNames": ["web_search"]
                            }
                        })
                    } else {
                        json!({
                            "functionCallingConfig": {
                                "mode": "AUTO"
                            }
                        })
                    })
                } else {
                    None
                },
            };

            emit_event(
                sink,
                &channel_id,
                GeminiEvent::Debug {
                    phase: "request.send".to_string(),
                    message: "Sending prompt to Gemini".to_string(),
                    payload: serde_json::to_value(&request_body).ok().map(|request| {
                        json!({
                            "model": model,
                            "iteration": iter + 1,
                            "request": request,
                        })
                    }),
                },
            );

            write_request_log(
                &GeminiRequestLogContext {
                    kind: "thread_stream",
                    channel_id: Some(&channel_id),
                    thread_id: thread_id.as_deref(),
                    iteration: Some(iter + 1),
                },
                &request_body,
            );

            // Clear any stale streamed text before the answer-synthesis pass.
            if !allow_tools && tool_calls > 0 {
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::Reset { clear_tools: false },
                );
            }

            let iteration = stream_iteration_with_transport_retry(
                sink,
                &client,
                &url,
                &api_key,
                &request_body,
                &channel_id,
                &request_control.cancel_token,
            )
            .await?;

            if !allow_tools {
                if iteration.text.trim().is_empty() {
                    return Err(if tool_calls > 0 {
                        "Gemini returned an empty answer after tool results.".to_string()
                    } else {
                        "Gemini returned an empty response.".to_string()
                    });
                }
                return Ok(iteration.text);
            }

            let Some(function_call) = iteration.function_call else {
                if iteration.text.trim().is_empty() {
                    if tool_calls > 0 && !final_tool_answer_prompt_added {
                        allow_tools = false;
                        final_tool_answer_prompt_added = true;
                        append_final_tool_answer_instruction(
                            &mut contents,
                            "The model ended the tool loop without producing user-facing answer text.",
                        );
                        emit_event(
                            sink,
                            &channel_id,
                            GeminiEvent::ToolStatus {
                                message: "Wrapping up with the search results".to_string(),
                            },
                        );
                        continue;
                    }

                    return Err(if tool_calls > 0 {
                        "Gemini returned an empty answer after tool results.".to_string()
                    } else {
                        "Gemini returned an empty response.".to_string()
                    });
                }
                return Ok(iteration.text);
            };

            if !is_supported_tool_name(&function_call.name) {
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::Debug {
                        phase: "tool.rejected".to_string(),
                        message: "Gemini returned an undeclared tool call".to_string(),
                        payload: Some(json!({
                            "model": model,
                            "tool": function_call.name,
                        })),
                    },
                );
                return Err(format!(
                    "Gemini returned an unsupported tool call `{}`.",
                    function_call.name
                ));
            }

            if !iteration.text.is_empty() {
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::Reset { clear_tools: false },
                );
            }

            let attachment_display_name = tool_attachment_lookup_value(&function_call)
                .and_then(|raw_value| {
                    find_attachment_display_name(raw_value, &attachment_display_name_by_path)
                });
            let status_text = tool_status_text(&function_call, attachment_display_name);
            let call_id = tool_step_id(iter, &function_call.name);
            if let Some(status_text_value) = status_text.as_ref() {
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::ToolStatus {
                        message: status_text_value.clone(),
                    },
                );
            }

            emit_event(
                sink,
                &channel_id,
                GeminiEvent::ToolStart {
                    id: call_id.clone(),
                    name: function_call.name.clone(),
                    args: function_call.args.clone(),
                    message: status_text.unwrap_or_default(),
                },
            );

            let mut dispatch_context = ToolDispatchContext {
                runtime,
                client: &client,
                api_key: &api_key,
                model: &model,
                thread_id: thread_id.as_deref(),
                request_control: &request_control,
                web_state: &mut web_tool_state,
            };
            let dispatch_result = dispatch_tool_call(&function_call, &mut dispatch_context, |message| {
                emit_event(sink, &channel_id, GeminiEvent::ToolStatus { message });
            })
            .await?;
            if function_call.name == "web_search" {
                force_web_search_pending = false;
            }

            emit_event(
                sink,
                &channel_id,
                GeminiEvent::ToolEnd {
                    id: call_id,
                    name: function_call.name.clone(),
                    status: dispatch_result.status.clone(),
                    result: dispatch_result.response_value.clone(),
                    message: dispatch_result.message.clone(),
                },
            );
            let model_response_value = model_safe_tool_response(&dispatch_result.response_value);

            if dispatch_result.is_failure {
                consecutive_tool_failures += 1;
            } else {
                consecutive_tool_failures = 0;
            }

            if request_control.is_answer_now_requested() {
                allow_tools = false;
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::ToolStatus {
                        message: "Wrapping up with what I have so far".to_string(),
                    },
                );
            }

            tool_calls += 1;
            if tool_calls >= MAX_TOOL_CALLS_PER_TURN {
                allow_tools = false;
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::ToolStatus {
                        message: "Wrapping up with what I have so far".to_string(),
                    },
                );
            }
            if consecutive_tool_failures >= 2 {
                allow_tools = false;
                emit_event(
                    sink,
                    &channel_id,
                    GeminiEvent::ToolStatus {
                        message:
                            "Tools are unavailable right now, continuing with available context"
                                .to_string(),
                    },
                );
            }

            contents.push(GeminiContent {
                role: "model".to_string(),
                parts: vec![GeminiPart {
                    function_call: Some(function_call.clone()),
                    thought_signature: iteration.function_call_thought_signature.clone(),
                    ..Default::default()
                }],
            });
            contents.push(GeminiContent {
                role: "user".to_string(),
                parts: vec![GeminiPart {
                    function_response: Some(GeminiFunctionResponse {
                        name: function_call.name.clone(),
                        response: model_response_value,
                    }),
                    ..Default::default()
                }],
            });
            if !dispatch_result.follow_up_parts.is_empty() {
                contents.push(GeminiContent {
                    role: "user".to_string(),
                    parts: dispatch_result.follow_up_parts,
                });
            }

            if !allow_tools && !final_tool_answer_prompt_added {
                final_tool_answer_prompt_added = true;
                append_final_tool_answer_instruction(&mut contents, "");
            }
        }

        Err("Maximum tool iterations reached without final response.".to_string())
    }
    .await;

    if let Some(task) = title_task {
        if let Err(error) = task.await {
            eprintln!("[ThreadTitle] Initial generation task failed: {error}");
        }
    }
    remove_request(runtime, &channel_id).await;

    result
}
