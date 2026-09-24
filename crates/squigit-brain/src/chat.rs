// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use chrono::Utc;
use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use squigit_storage::threads::types::CitationSource;
use squigit_storage::{
    AttachmentFileType, AttachmentManifestEntry, MessageAttachment, SideChatData, ThreadData,
    ThreadMessage, ThreadStorage,
};
use tokio_util::sync::CancellationToken;

use crate::provider::gemini::attachments::{
    ensure_file_uploaded_for_credential, load_active_credential, ActiveCredential, GeminiFileRef,
};
use crate::provider::gemini::chat_transport::{generate_content, stream_content};
use crate::provider::gemini::models::{build_attempt_plan, BOOTSTRAP_LITE_MODEL};
use crate::provider::gemini::transport::types::{
    GeminiContent, GeminiFileData, GeminiGenerationConfig, GeminiPart, GeminiRequest,
    GeminiSystemInstruction, GeminiThinkingConfig,
};
use crate::runtime::BrainRuntimeState;

pub type ChatEventSink = Arc<dyn Fn(ChatEvent) + Send + Sync>;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatKind {
    Thread,
    Sidechat,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChatMode {
    InitialImage,
    Submit,
    Edit,
    Regenerate,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub kind: ChatKind,
    pub id: String,
    pub mode: ChatMode,
    pub message_markdown: String,
    pub prompt_text: String,
    #[serde(default)]
    pub attachment_hashes: Vec<String>,
    pub model_id: String,
    pub effort: String,
    #[serde(default)]
    pub force_web_search: bool,
    #[serde(default)]
    pub reuse_latest_user: bool,
    pub target_message_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChatEvent {
    Chunk { content: String },
    Complete { content: String },
    Cancelled,
    Error { message: String },
}

enum ConversationData {
    Thread(ThreadData),
    Sidechat(SideChatData),
}

impl ConversationData {
    fn load(storage: &ThreadStorage, kind: ChatKind, id: &str) -> Result<Self, String> {
        match kind {
            ChatKind::Thread => storage
                .load_thread(id)
                .map(Self::Thread)
                .map_err(|error| error.to_string()),
            ChatKind::Sidechat => storage
                .load_sidechat(id)
                .map(Self::Sidechat)
                .map_err(|error| error.to_string()),
        }
    }

    fn messages(&self) -> &[ThreadMessage] {
        match self {
            Self::Thread(data) => &data.messages,
            Self::Sidechat(data) => &data.messages,
        }
    }

    fn manifest(&self) -> &[AttachmentManifestEntry] {
        match self {
            Self::Thread(data) => &data.attachment_manifest,
            Self::Sidechat(data) => &data.attachment_manifest,
        }
    }

    fn image_hash(&self) -> Option<&str> {
        match self {
            Self::Thread(data) => Some(&data.metadata.image_hash),
            Self::Sidechat(_) => None,
        }
    }

    fn save_messages(
        &mut self,
        storage: &ThreadStorage,
        messages: Vec<ThreadMessage>,
    ) -> Result<(), String> {
        match self {
            Self::Thread(data) => {
                data.messages = messages;
                data.metadata.updated_at = Utc::now();
                storage
                    .save_thread(data)
                    .map_err(|error| error.to_string())?;
                let id = data.metadata.id.clone();
                *data = storage
                    .load_thread(&id)
                    .map_err(|error| error.to_string())?;
            }
            Self::Sidechat(data) => {
                data.messages = messages;
                data.metadata.updated_at = Utc::now();
                storage
                    .save_sidechat(data)
                    .map_err(|error| error.to_string())?;
                let id = data.metadata.id.clone();
                *data = storage
                    .load_sidechat(&id)
                    .map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }
}

fn user_message(content: String, hashes: &[String]) -> ThreadMessage {
    ThreadMessage::user_with_attachments(
        content,
        hashes
            .iter()
            .cloned()
            .map(|attachment_hash| MessageAttachment {
                attachment_hash,
                source_path: None,
            })
            .collect(),
    )
}

fn prospective_messages(
    request: &ChatRequest,
    original: &[ThreadMessage],
) -> Result<(Vec<ThreadMessage>, bool), String> {
    let mut messages = original.to_vec();
    match request.mode {
        ChatMode::InitialImage => {
            if !messages.is_empty() {
                return Err("This image thread already has a conversation".to_string());
            }
            Ok((messages, false))
        }
        ChatMode::Submit if request.reuse_latest_user => {
            let Some(ThreadMessage::User { content, .. }) = messages.last() else {
                return Err("The new Side Chat has no first message".to_string());
            };
            if content != &request.message_markdown {
                return Err("The first Side Chat message changed before inference".to_string());
            }
            Ok((messages, false))
        }
        ChatMode::Submit => {
            if request.message_markdown.trim().is_empty() {
                return Err("A user message is required".to_string());
            }
            messages.push(user_message(
                request.message_markdown.clone(),
                &request.attachment_hashes,
            ));
            Ok((messages, true))
        }
        ChatMode::Edit | ChatMode::Regenerate => {
            if matches!(request.mode, ChatMode::Regenerate)
                && matches!(request.kind, ChatKind::Thread)
                && request.target_message_id.is_none()
                && matches!(messages.as_slice(), [ThreadMessage::Assistant { .. }])
            {
                messages.clear();
                return Ok((messages, false));
            }
            let target = request
                .target_message_id
                .as_deref()
                .ok_or_else(|| "A target user message is required".to_string())?;
            let index = messages
                .iter()
                .position(|message| message.id() == target)
                .ok_or_else(|| "The target message no longer exists".to_string())?;
            if !matches!(&messages[index], ThreadMessage::User { .. })
                || messages[index + 1..]
                    .iter()
                    .any(|message| matches!(message, ThreadMessage::User { .. }))
            {
                return Err("Only the latest user message can be replaced".to_string());
            }
            messages.truncate(index + 1);
            if matches!(request.mode, ChatMode::Edit) {
                messages[index] = ThreadMessage::User {
                    id: target.to_string(),
                    content: request.message_markdown.clone(),
                    timestamp: Utc::now(),
                    attachments: request
                        .attachment_hashes
                        .iter()
                        .cloned()
                        .map(|attachment_hash| MessageAttachment {
                            attachment_hash,
                            source_path: None,
                        })
                        .collect(),
                };
            }
            Ok((messages, false))
        }
    }
}

#[derive(Deserialize)]
struct IdentityPrompt {
    identity: String,
    initial: String,
}

#[derive(Deserialize)]
struct SharedPrompt {
    shared: String,
    effort: BTreeMap<String, String>,
}

fn system_prompt(
    request: &ChatRequest,
    messages: &[ThreadMessage],
    guide_path: &str,
) -> Result<String, String> {
    let identity_source = match request.kind {
        ChatKind::Thread => include_str!("assets/core/squigit_soul.yml"),
        ChatKind::Sidechat => include_str!("assets/core/sidechat_soul.yml"),
    };
    let identity: IdentityPrompt =
        serde_yaml::from_str(identity_source).map_err(|error| error.to_string())?;
    let shared: SharedPrompt = serde_yaml::from_str(include_str!("assets/core/system_prompt.yml"))
        .map_err(|error| error.to_string())?;
    let mut prompt = format!(
        "{}\n{}\n{}\n{}\nCurrent date: {}. The Squigit guide is installed at {}. The app can retrieve it for app help. A local skill catalog is available only when the user asks for @skills; load a named skill only when the user requests @skill/ID.",
        identity.identity,
        if matches!(request.mode, ChatMode::InitialImage) || messages.len() <= 1 {
            identity.initial
        } else {
            match request.kind {
                ChatKind::Thread => include_str!("assets/core/context_window.md").to_string(),
                ChatKind::Sidechat => include_str!("assets/core/sidechat_context.md").to_string(),
            }
        },
        shared.shared,
        shared
            .effort
            .get(&request.effort)
            .ok_or_else(|| "Unsupported model effort".to_string())?,
        Utc::now().date_naive(),
        guide_path
    );
    if matches!(request.kind, ChatKind::Thread) {
        if let Some(first_intent) = messages.iter().find_map(|message| match message {
            ThreadMessage::User { content, .. } => Some(content.as_str()),
            _ => None,
        }) {
            prompt.push_str("\nFirst user intent: ");
            prompt.push_str(first_intent);
        }
    }
    if request.effort != "low" {
        prompt.push_str("\nScene guidance (use only if relevant): ");
        prompt.push_str(include_str!("assets/knowledge/known_scenes.json"));
    }
    Ok(prompt)
}

fn requested_skill_ids(message: &str) -> Vec<String> {
    let words = message.split_whitespace().collect::<Vec<_>>();
    let mut requested = Vec::new();
    for (index, word) in words.iter().enumerate() {
        let id = if *word == "/skill" {
            words.get(index + 1).copied()
        } else {
            word.strip_prefix("@skill/")
        };
        let Some(id) = id else { continue };
        let id = id.trim_end_matches(|character: char| {
            !character.is_ascii_alphanumeric() && character != '-'
        });
        if !id.is_empty() && !requested.iter().any(|existing| existing == id) {
            requested.push(id.to_string());
        }
    }
    requested
}

fn generation_request(system: String, contents: Vec<GeminiContent>, search: bool) -> GeminiRequest {
    GeminiRequest {
        contents,
        system_instruction: GeminiSystemInstruction {
            parts: vec![GeminiPart {
                text: Some(system),
                ..Default::default()
            }],
        },
        generation_config: GeminiGenerationConfig {
            temperature: None,
            response_mime_type: None,
            response_schema: None,
            thinking_config: None,
        },
        tools: search.then(|| vec![serde_json::json!({ "googleSearch": {} })]),
    }
}

fn apply_effort(request: &mut GeminiRequest, model: &str, effort: &str) {
    request.generation_config.thinking_config =
        if model.trim_start_matches("models/").starts_with("gemini-3") {
            Some(GeminiThinkingConfig {
                thinking_level: effort.to_string(),
            })
        } else {
            None
        };
}

fn manifest_context(manifest: &[AttachmentManifestEntry]) -> String {
    let rows = manifest
        .iter()
        .map(|entry| {
            serde_json::json!({
                "hash": entry.attachment_hash,
                "name": entry.display_name,
                "kind": entry.file_type,
                "brief": entry.file_brief.as_deref().map(|brief| brief.chars().take(400).collect::<String>()),
            })
        })
        .collect::<Vec<_>>();
    format!(
        "Attachment index for this conversation: {}",
        serde_json::Value::Array(rows)
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecallPlan {
    #[serde(default)]
    hashes: Vec<String>,
    #[serde(default)]
    read_guide: bool,
    #[serde(default)]
    search_web: bool,
}

async fn plan_recall(
    credential: &ActiveCredential,
    message: &str,
    manifest: &[AttachmentManifestEntry],
    cancel: &CancellationToken,
) -> RecallPlan {
    let prompt = format!(
        "Select only old files whose FULL CONTENT is necessary to answer this message. Use their names and briefs to disambiguate. Decide whether the Squigit app guide is needed and whether fresh web evidence is needed for a time-sensitive or explicitly web-based question. Reply as JSON only: {{\"hashes\":[],\"readGuide\":false,\"searchWeb\":false}}.\nMessage: {message}\n{}",
        manifest_context(manifest)
    );
    let mut request = generation_request(
        "You select files for a screen assistant. Do not answer the user.".to_string(),
        vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart {
                text: Some(prompt),
                ..Default::default()
            }],
        }],
        false,
    );
    request.generation_config.response_mime_type = Some("application/json".to_string());
    let result = generate_content(credential.api_key(), BOOTSTRAP_LITE_MODEL, &request, cancel)
        .await
        .ok()
        .and_then(|response| serde_json::from_str::<RecallPlan>(&response.text).ok());
    result.unwrap_or(RecallPlan {
        hashes: Vec::new(),
        read_guide: message.to_ascii_lowercase().contains("squigit"),
        search_web: false,
    })
}

fn history_contents(
    request: &ChatRequest,
    messages: &[ThreadMessage],
    file_parts: Vec<GeminiPart>,
    extra_context: Vec<String>,
) -> Vec<GeminiContent> {
    if matches!(request.mode, ChatMode::InitialImage)
        || (matches!(request.kind, ChatKind::Thread) && messages.is_empty())
    {
        let mut parts = file_parts;
        parts.extend(extra_context.into_iter().map(|text| GeminiPart {
            text: Some(text),
            ..Default::default()
        }));
        parts.push(GeminiPart {
            text: Some(
                "Analyze this captured image and give the most useful first response.".to_string(),
            ),
            ..Default::default()
        });
        return vec![GeminiContent {
            role: "user".to_string(),
            parts,
        }];
    }
    let mut contents = messages
        .iter()
        .map(|message| GeminiContent {
            role: match message {
                ThreadMessage::User { .. } => "user".to_string(),
                ThreadMessage::Assistant { .. } => "model".to_string(),
            },
            parts: vec![GeminiPart {
                text: Some(message.content().to_string()),
                ..Default::default()
            }],
        })
        .collect::<Vec<_>>();
    if let Some(last) = contents.last_mut() {
        if last.role == "user" {
            last.parts[0].text = Some(request.prompt_text.clone());
            last.parts.extend(file_parts);
            last.parts
                .extend(extra_context.into_iter().map(|text| GeminiPart {
                    text: Some(text),
                    ..Default::default()
                }));
        }
    }
    contents
}

async fn fallback_web_search(
    request: &ChatRequest,
    contents: &[GeminiContent],
    credential: &ActiveCredential,
    cancel: &CancellationToken,
) -> Result<(String, Vec<CitationSource>), String> {
    let query = if matches!(request.kind, ChatKind::Thread)
        && request.message_markdown.trim().is_empty()
    {
        let query_request = generation_request(
            "Write one short web search query for time-sensitive facts visible in this screenshot. Return only the query.".to_string(),
            contents.to_vec(),
            false,
        );
        generate_content(
            credential.api_key(),
            BOOTSTRAP_LITE_MODEL,
            &query_request,
            cancel,
        )
        .await?
        .text
    } else {
        request
            .message_markdown
            .chars()
            .take(240)
            .collect::<String>()
    };
    let query = query.trim();
    if query.is_empty() {
        return Err("Web search could not form a query for this image".to_string());
    }
    let found = tokio::select! {
        result = crate::web::search_query(query, Some(6)) => result?,
        _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
    };
    if found.sources.is_empty() {
        return Err("Web search returned no sources".to_string());
    }
    let allowed = crate::web::collect_allowed_sources(&found);
    let pages = join_all(
        found
            .sources
            .iter()
            .take(3)
            .map(|source| crate::web::fetch_url_from_allowed(&source.url, &allowed)),
    );
    let pages = tokio::select! {
        result = pages => result,
        _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
    };
    let mut context = found.context_markdown;
    for page in pages.into_iter().flatten() {
        context.push_str("\n\n");
        context.extend(page.context_markdown.chars().take(4_000));
    }
    Ok((context, found.sources))
}

pub(crate) async fn run_chat(
    runtime: &BrainRuntimeState,
    request: &ChatRequest,
    cancel: &CancellationToken,
    emit: &ChatEventSink,
) -> Result<String, String> {
    let lock = runtime.conversation_lock(&request.id).await;
    let _guard = lock.lock().await;
    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    let mut conversation = ConversationData::load(&storage, request.kind, &request.id)?;
    let credential = load_active_credential().await?;
    let guide_path = crate::guide::guide_path()?;
    let guide_path = guide_path.to_string_lossy().to_string();
    let (working, persist_user_now) = prospective_messages(request, conversation.messages())?;
    let image_opening = matches!(request.kind, ChatKind::Thread) && working.is_empty();
    if persist_user_now {
        conversation.save_messages(&storage, working.clone())?;
    }
    let mut manifest = conversation.manifest().to_vec();
    for hash in &request.attachment_hashes {
        if !manifest.iter().any(|entry| &entry.attachment_hash == hash) {
            manifest.push(
                storage
                    .attachment_manifest_entry(hash, hash, Utc::now())
                    .map_err(|error| error.to_string())?,
            );
        }
    }
    let current_hashes = request
        .attachment_hashes
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    let recall = if image_opening {
        RecallPlan {
            hashes: Vec::new(),
            read_guide: false,
            search_web: true,
        }
    } else {
        plan_recall(&credential, &request.prompt_text, &manifest, cancel).await
    };
    let fallback_search_needed = recall.search_web;
    let selected = recall
        .hashes
        .into_iter()
        .filter(|hash| manifest.iter().any(|entry| entry.attachment_hash == *hash))
        .chain(current_hashes.iter().cloned())
        .chain(
            image_opening
                .then(|| conversation.image_hash().map(str::to_string))
                .flatten(),
        )
        .collect::<BTreeSet<_>>();
    let mut file_parts = Vec::new();
    let mut brief_hashes = Vec::new();
    for hash in selected {
        let object = storage
            .load_object_manifest(&hash)
            .map_err(|error| error.to_string())?;
        if object.file_context.file_type == AttachmentFileType::TextLocal {
            if !current_hashes.contains(&hash) {
                let path = storage
                    .find_object_blob(&hash)
                    .map_err(|error| error.to_string())?;
                let content = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
                let name = manifest
                    .iter()
                    .find(|entry| entry.attachment_hash == hash)
                    .map(|entry| entry.display_name.as_str())
                    .unwrap_or("text attachment");
                file_parts.push(GeminiPart {
                    text: Some(format!("[Recalled text attachment: {name}]\n{content}\n[/Recalled text attachment]")),
                    ..Default::default()
                });
            }
            continue;
        }
        let path = storage
            .find_object_blob(&hash)
            .map_err(|error| error.to_string())?;
        let file = ensure_file_uploaded_for_credential(
            runtime,
            &credential,
            &path.to_string_lossy(),
            cancel,
        )
        .await?
        .file_ref;
        file_parts.push(GeminiPart {
            file_data: Some(GeminiFileData {
                mime_type: file.mime_type,
                file_uri: file.file_uri,
            }),
            ..Default::default()
        });
        if object.file_context.file_brief.is_none() {
            brief_hashes.push(hash);
        }
    }
    for entry in &manifest {
        if entry.file_brief.is_none()
            && entry.file_type != AttachmentFileType::TextLocal
            && !brief_hashes.contains(&entry.attachment_hash)
        {
            brief_hashes.push(entry.attachment_hash.clone());
        }
    }
    if !brief_hashes.is_empty() {
        let brief_runtime = runtime.clone();
        let brief_credential = credential.clone();
        let brief_id = request.id.clone();
        let brief_kind = request.kind;
        tokio::spawn(async move {
            generate_file_briefs(
                &brief_runtime,
                &brief_credential,
                brief_kind,
                &brief_id,
                brief_hashes,
            )
            .await;
        });
    }
    let mut extra_context = vec![manifest_context(&manifest)];
    if recall.read_guide {
        extra_context.push(format!(
            "Squigit app guide (retrieved from disk):\n{}",
            crate::guide::read_installed()?
        ));
    }
    if request
        .message_markdown
        .split_whitespace()
        .any(|word| word == "@skills" || word == "/skills")
    {
        extra_context.push(format!(
            "Installed Squigit skill catalog (retrieved from disk):\n{}",
            crate::guide::read_skill_catalog()?
        ));
    }
    for id in requested_skill_ids(&request.message_markdown) {
        match crate::guide::read_skill(&id) {
            Ok(skill) => extra_context.push(format!(
                "User requested Squigit skill {id} (retrieved from disk):\n{skill}"
            )),
            Err(_) => extra_context.push(format!(
                "The requested skill {id} is unavailable. The installed catalog is:\n{}",
                crate::guide::read_skill_catalog()?
            )),
        }
    }
    let system = system_prompt(request, &working, &guide_path)?;
    let contents = history_contents(request, &working, file_parts, extra_context);
    let models = build_attempt_plan(&request.model_id, &request.effort)?;
    let force_search = request.force_web_search || image_opening || fallback_search_needed;
    let mut search_context = String::new();
    let mut search_citations = Vec::<CitationSource>::new();
    if force_search {
        let mut search_request = generation_request(
            format!("{system}\nUse Google Search for current evidence. Return a concise evidence note with source URLs."),
            contents.clone(),
            true,
        );
        'grounding: for model in &models {
            apply_effort(&mut search_request, model, &request.effort);
            for retry in 0..3 {
                match generate_content(credential.api_key(), model, &search_request, cancel).await {
                    Ok(result) => {
                        if !result.citations.is_empty() {
                            search_context = result.text;
                            search_citations = result.citations;
                            break 'grounding;
                        }
                        break;
                    }
                    Err(error) if error == "CANCELLED" => return Err(error),
                    Err(error)
                        if error.starts_with("Gemini API error (4")
                            && !error.starts_with("Gemini API error (429") =>
                    {
                        break
                    }
                    Err(_) if retry < 2 => {
                        let delay = if retry == 0 { 15 } else { 30 };
                        tokio::select! {
                            _ = tokio::time::sleep(std::time::Duration::from_secs(delay)) => {},
                            _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
                        }
                    }
                    Err(_) => break,
                }
            }
        }
        if search_citations.is_empty() {
            match fallback_web_search(request, &contents, &credential, cancel).await {
                Ok((context, citations)) => {
                    search_context = context;
                    search_citations = citations;
                }
                Err(error) if error == "CANCELLED" => return Err(error),
                Err(_) => {
                    search_context = "Live web search is unavailable. Say that current facts could not be verified and answer only what the provided material supports.".to_string();
                }
            }
        }
    }
    let mut final_contents = contents;
    if !search_context.is_empty() {
        if let Some(last) = final_contents.last_mut() {
            let heading = if search_citations.is_empty() {
                "Web search status"
            } else {
                "Web evidence retrieved for this turn. Base current claims on this evidence and cite its source URLs inline"
            };
            last.parts.push(GeminiPart {
                text: Some(format!("{heading}:\n{search_context}")),
                ..Default::default()
            });
        }
    }
    let mut last_error = "All Gemini model candidates failed".to_string();
    let mut answer = None;
    let mut native_search = !force_search;
    for model in &models {
        for retry in 0..3usize {
            let mut stream_request =
                generation_request(system.clone(), final_contents.clone(), native_search);
            apply_effort(&mut stream_request, model, &request.effort);
            let result =
                stream_content(credential.api_key(), model, &stream_request, cancel, emit).await;
            match result {
                Ok(mut result) => {
                    result.citations.extend(search_citations.clone());
                    answer = Some(result);
                    break;
                }
                Err(error) if error == "CANCELLED" => return Err(error),
                Err(error) if error.starts_with("PARTIAL_STREAM:") => return Err(error),
                Err(error)
                    if native_search
                        && (error.contains("Gemini API error (400")
                            || error.contains("Gemini API error (404")) =>
                {
                    native_search = false;
                    if fallback_search_needed {
                        match fallback_web_search(request, &final_contents, &credential, cancel)
                            .await
                        {
                            Ok((context, citations)) => {
                                search_citations = citations;
                                if let Some(last) = final_contents.last_mut() {
                                    last.parts.push(GeminiPart {
                                        text: Some(format!("Web evidence retrieved for this turn. Cite the source URLs inline:\n{context}")),
                                        ..Default::default()
                                    });
                                }
                            }
                            Err(fallback_error) if fallback_error == "CANCELLED" => {
                                return Err(fallback_error)
                            }
                            Err(_) => {
                                if let Some(last) = final_contents.last_mut() {
                                    last.parts.push(GeminiPart {
                                        text: Some("Live web search is unavailable. Do not claim current facts were verified.".to_string()),
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                    }
                    last_error = error;
                    continue;
                }
                Err(error) => {
                    last_error = error;
                    if last_error.starts_with("Gemini API error (4")
                        && !last_error.starts_with("Gemini API error (429")
                    {
                        break;
                    }
                    if retry < 2 {
                        let delay = if retry == 0 { 15 } else { 30 };
                        tokio::select! {
                            _ = tokio::time::sleep(std::time::Duration::from_secs(delay)) => {},
                            _ = cancel.cancelled() => return Err("CANCELLED".to_string()),
                        }
                    }
                }
            }
        }
        if answer.is_some() {
            break;
        }
    }
    let result = answer.ok_or(last_error)?;
    let mut content = result.text;
    let mut citations = BTreeMap::<String, CitationSource>::new();
    for citation in result.citations {
        citations.entry(citation.url.clone()).or_insert(citation);
    }
    let citations = citations.into_values().collect::<Vec<_>>();
    if !citations.is_empty() && !citations.iter().any(|source| content.contains(&source.url)) {
        content.push_str("\n\nSources: ");
        content.push_str(
            &citations
                .iter()
                .map(|source| format!("[{}]({})", source.title, source.url))
                .collect::<Vec<_>>()
                .join(", "),
        );
    }
    if cancel.is_cancelled() {
        return Err("CANCELLED".to_string());
    }
    let mut saved = working;
    saved.push(ThreadMessage::Assistant {
        id: format!("msg-{}", uuid::Uuid::new_v4()),
        content: content.clone(),
        timestamp: Utc::now(),
        citations,
        tool_steps: Vec::new(),
    });
    conversation.save_messages(&storage, saved)?;
    Ok(content)
}

async fn generate_file_briefs(
    runtime: &BrainRuntimeState,
    credential: &ActiveCredential,
    kind: ChatKind,
    id: &str,
    hashes: Vec<String>,
) {
    let storage = match ThreadStorage::new() {
        Ok(storage) => storage,
        Err(_) => return,
    };
    let mut pending = Vec::<(String, GeminiFileRef)>::new();
    let cancellation = CancellationToken::new();
    for hash in hashes {
        let Ok(manifest) = storage.load_object_manifest(&hash) else {
            continue;
        };
        if manifest.file_context.file_brief.is_some() {
            continue;
        }
        let Ok(path) = storage.find_object_blob(&hash) else {
            continue;
        };
        if let Ok(ensured) = ensure_file_uploaded_for_credential(
            runtime,
            credential,
            &path.to_string_lossy(),
            &cancellation,
        )
        .await
        {
            pending.push((hash, ensured.file_ref));
        }
    }
    if pending.is_empty() {
        return;
    }
    let mut parts = Vec::new();
    for (hash, file) in &pending {
        parts.push(GeminiPart {
            text: Some(format!("File hash: {hash}")),
            ..Default::default()
        });
        parts.push(GeminiPart {
            file_data: Some(GeminiFileData {
                mime_type: file.mime_type.clone(),
                file_uri: file.file_uri.clone(),
            }),
            ..Default::default()
        });
    }
    parts.push(GeminiPart {
        text: Some("Return JSON with a `briefs` array. Each item has `hash` and `brief`. Write one compact factual description for every file, including its subject and distinguishing terms. Do not guess unreadable content.".to_string()),
        ..Default::default()
    });
    let mut request = generation_request(
        "Describe files for later retrieval. Output only valid JSON.".to_string(),
        vec![GeminiContent {
            role: "user".to_string(),
            parts,
        }],
        false,
    );
    request.generation_config.response_mime_type = Some("application/json".to_string());
    for retry in 0..3 {
        let response = generate_content(
            credential.api_key(),
            BOOTSTRAP_LITE_MODEL,
            &request,
            &cancellation,
        )
        .await;
        if let Ok(response) = response {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&response.text) {
                if let Some(briefs) = value.get("briefs").and_then(serde_json::Value::as_array) {
                    for item in briefs {
                        let (Some(hash), Some(brief)) = (
                            item.get("hash").and_then(serde_json::Value::as_str),
                            item.get("brief").and_then(serde_json::Value::as_str),
                        ) else {
                            continue;
                        };
                        if !pending.iter().any(|(candidate, _)| candidate == hash)
                            || brief.trim().is_empty()
                        {
                            continue;
                        }
                        let Ok(_guard) = storage.lock_object_manifest(hash) else {
                            continue;
                        };
                        let Ok(mut manifest) = storage.load_object_manifest(hash) else {
                            continue;
                        };
                        manifest.file_context.file_brief =
                            Some(brief.trim().chars().take(600).collect());
                        let _ = storage.save_object_manifest(hash, &manifest);
                    }
                    let lock = runtime.conversation_lock(id).await;
                    let _guard = lock.lock().await;
                    if let Ok(mut conversation) = ConversationData::load(&storage, kind, id) {
                        let messages = conversation.messages().to_vec();
                        let _ = conversation.save_messages(&storage, messages);
                    }
                    return;
                }
            }
        }
        if retry < 2 {
            tokio::time::sleep(std::time::Duration::from_secs(if retry == 0 {
                2
            } else {
                5
            }))
            .await;
        }
    }
}
