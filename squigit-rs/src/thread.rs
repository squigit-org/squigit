// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::brain::ImageThreadCredentialSnapshot;
use crate::storage::{
    self, AssistantError, AttachmentFileType, ManifestMention, MessageAttachment, MessageGrounding,
    MessageTextCitation, SideChatData, SideChatMetadata, ThreadData, ThreadMessage, ThreadMetadata,
    ThreadStorage, DEFAULT_SIDE_CHAT_TITLE, DEFAULT_THREAD_TITLE,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::services::brain;
use crate::settings;

pub type ThreadResult<T> = std::result::Result<T, String>;

/// One attachment mention supplied by a shell when appending a message.
/// Shells that know display names and file types pass them; otherwise the
/// manifest touch falls back to the CAS blob filename and keeps `None` briefs.
#[derive(Clone, Debug, Deserialize)]
pub struct MessageAttachmentInput {
    pub attachment_hash: String,
    pub source_path: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub file_type: Option<AttachmentFileType>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageThreadCreation {
    pub thread_id: String,
    pub brain_job_id: Option<String>,
    pub ocr_job_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideChatCreation {
    pub sidechat_id: String,
    pub title: String,
}

pub struct ConversationFork {
    pub id: String,
    pub title: String,
}

pub fn fork_thread_at_message(thread_id: &str, message_id: &str) -> ThreadResult<ConversationFork> {
    let metadata = active_storage()?
        .fork_thread_at_message(thread_id, message_id)
        .map_err(|error| error.to_string())?;
    Ok(ConversationFork {
        id: metadata.id,
        title: metadata.title,
    })
}

pub fn fork_sidechat_at_message(
    sidechat_id: &str,
    message_id: &str,
) -> ThreadResult<ConversationFork> {
    let metadata = active_storage()?
        .fork_sidechat_at_message(sidechat_id, message_id)
        .map_err(|error| error.to_string())?;
    Ok(ConversationFork {
        id: metadata.id,
        title: metadata.title,
    })
}

struct PendingImageThreadCredential {
    credential: Option<ImageThreadCredentialSnapshot>,
    captured_at: Instant,
}

static PENDING_IMAGE_THREAD_CREDENTIALS: OnceLock<
    Mutex<BTreeMap<String, PendingImageThreadCredential>>,
> = OnceLock::new();
static NEXT_IMAGE_THREAD_CREATION_ID: AtomicU64 = AtomicU64::new(1);
static THREAD_INDEX_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const IMAGE_THREAD_CREATION_TTL: Duration = Duration::from_secs(10 * 60);

pub(super) fn active_storage() -> ThreadResult<ThreadStorage> {
    storage::thread_store().map_err(|error| error.to_string())
}

fn pending_image_thread_credentials(
) -> &'static Mutex<BTreeMap<String, PendingImageThreadCredential>> {
    PENDING_IMAGE_THREAD_CREDENTIALS.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn thread_index_lock() -> &'static Mutex<()> {
    THREAD_INDEX_LOCK.get_or_init(|| Mutex::new(()))
}

fn lock_pending_image_thread_credentials(
) -> ThreadResult<std::sync::MutexGuard<'static, BTreeMap<String, PendingImageThreadCredential>>> {
    pending_image_thread_credentials()
        .lock()
        .map_err(|_| "Image thread credential snapshots are unavailable".to_string())
}

pub async fn prepare_image_thread_creation() -> ThreadResult<String> {
    let credential = brain()
        .capture_image_thread_credential(settings::load_config()?.model)
        .await?;
    let sequence = NEXT_IMAGE_THREAD_CREATION_ID.fetch_add(1, Ordering::Relaxed);
    let creation_id = format!("image-thread-creation-{sequence}");
    let now = Instant::now();
    let mut pending = lock_pending_image_thread_credentials()?;
    pending.retain(|_, entry| {
        now.saturating_duration_since(entry.captured_at) <= IMAGE_THREAD_CREATION_TTL
    });
    pending.insert(
        creation_id.clone(),
        PendingImageThreadCredential {
            credential,
            captured_at: now,
        },
    );
    drop(pending);
    let cleanup_creation_id = creation_id.clone();
    tokio::spawn(async move {
        tokio::time::sleep(IMAGE_THREAD_CREATION_TTL).await;
        let _ = cancel_image_thread_creation(&cleanup_creation_id);
    });
    Ok(creation_id)
}

pub fn cancel_image_thread_creation(creation_id: &str) -> ThreadResult<()> {
    if let Some(pending) = PENDING_IMAGE_THREAD_CREDENTIALS.get() {
        pending
            .lock()
            .map_err(|_| "Image thread credential snapshots are unavailable".to_string())?
            .remove(creation_id);
    }
    Ok(())
}

fn take_image_thread_credential(
    creation_id: &str,
) -> ThreadResult<Option<ImageThreadCredentialSnapshot>> {
    let entry = lock_pending_image_thread_credentials()?
        .remove(creation_id)
        .ok_or_else(|| {
            "The image thread creation snapshot expired or was already used".to_string()
        })?;
    if entry.captured_at.elapsed() > IMAGE_THREAD_CREATION_TTL {
        return Err("The image thread creation snapshot expired".to_string());
    }
    Ok(entry.credential)
}

pub(crate) fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .is_some_and(|extension| {
            matches!(
                extension.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg"
            )
        })
}

fn prepared_rendition(
    storage: &ThreadStorage,
    rendition_path: &str,
) -> ThreadResult<crate::harness::images::StoredImageObject> {
    let hash = Path::new(rendition_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The image rendition is not a CAS object".to_string())?;
    let cas_path = storage
        .find_object_blob(hash)
        .map_err(|error| error.to_string())?;
    if std::fs::canonicalize(&cas_path).ok() != std::fs::canonicalize(rendition_path).ok() {
        return Err("The image rendition is not a CAS object".to_string());
    }
    Ok(crate::harness::images::StoredImageObject {
        tone: storage
            .get_image_tone(hash)
            .unwrap_or_else(|| "dark".to_string()),
        hash: hash.to_string(),
        cas_path: cas_path.to_string_lossy().to_string(),
    })
}

fn create_thread_on_disk(
    source_path: &str,
    rendition_path: Option<&str>,
    workspace_id: Option<&str>,
) -> ThreadResult<(String, String)> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err("The pasted image file could not be found".to_string());
    }
    if !is_supported_image(source) {
        return Err("Thread creation requires a supported image file".to_string());
    }
    let storage = active_storage()?;
    let bytes = std::fs::read(source).map_err(|error| error.to_string())?;
    let original_image_hash = blake3::hash(&bytes).to_hex().to_string();
    let (rendition, image_blob) = match rendition_path {
        Some(rendition_path) => (
            prepared_rendition(&storage, rendition_path)?,
            storage
                .image_blob_name(source)
                .ok_or_else(|| "Captured images must be stored in blob storage".to_string())?,
        ),
        None => {
            let rendition = crate::harness::images::store_image_rendition(&bytes)?;
            let image_blob = match storage.image_blob_name(source) {
                Some(name) => name,
                None => {
                    let extension = source
                        .extension()
                        .and_then(|value| value.to_str())
                        .unwrap_or("png");
                    storage
                        .store_image_blob(&bytes, extension)
                        .map_err(|error| error.to_string())?
                        .name
                }
            };
            (rendition, image_blob)
        }
    };

    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let display_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pasted-image.png");
    let metadata = ThreadMetadata::new(
        DEFAULT_THREAD_TITLE.to_string(),
        rendition.hash.clone(),
        original_image_hash,
        image_blob,
    );
    let initial_attachment = storage
        .attachment_manifest_entry(&metadata.image_hash, display_name, Utc::now())
        .map_err(|error| error.to_string())?;
    let thread = ThreadData::new(metadata.clone(), initial_attachment);
    match workspace_id.map(str::trim).filter(|id| !id.is_empty()) {
        Some(workspace_id) => storage
            .save_thread_in_workspace(&thread, workspace_id)
            .map_err(|error| error.to_string())?,
        None => storage
            .save_thread(&thread)
            .map_err(|error| error.to_string())?,
    }
    Ok((metadata.id, rendition.cas_path))
}

fn persist_generated_title(thread_id: &str, title: &str) -> ThreadResult<()> {
    let title = title.trim();
    if title.is_empty() {
        return Err("The generated thread title was empty".to_string());
    }
    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let storage = active_storage()?;
    let mut thread = storage
        .load_thread(thread_id)
        .map_err(|error| error.to_string())?;
    if thread.metadata.title != DEFAULT_THREAD_TITLE {
        return Ok(());
    }
    thread.metadata.title = title.to_string();
    storage
        .update_thread_metadata(&thread.metadata)
        .map_err(|error| error.to_string())
}

pub async fn create_image_thread(
    creation_id: String,
    source_path: String,
    rendition_path: Option<String>,
    workspace_id: Option<String>,
) -> ThreadResult<ImageThreadCreation> {
    let credential = take_image_thread_credential(&creation_id)?;
    let config = settings::load_config()?;
    let creation_workspace_id = workspace_id.clone();
    let (thread_id, image_path) = tokio::task::spawn_blocking(move || {
        create_thread_on_disk(
            &source_path,
            rendition_path.as_deref(),
            creation_workspace_id.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Thread creation task failed: {error}"))??;

    let brain_job_id = if let Some(credential) = credential {
        let main_credential = credential.clone();
        let title_id = thread_id.clone();
        tokio::spawn(async move {
            if let Ok(title) = brain()
                .initial_thread_title(title_id.clone(), image_path, credential)
                .await
            {
                let _ =
                    tokio::task::spawn_blocking(move || persist_generated_title(&title_id, &title))
                        .await;
            }
        });
        Some(start_conversation_response_with_snapshot(
            &thread_id,
            config.model.clone(),
            config.effort.clone(),
            true,
            Some(main_credential),
        )?)
    } else {
        None
    };
    let ocr_job_id = config
        .ocr_enabled
        .then(|| ocr::start_ocr_thread_job(&thread_id, &config.ocr_language))
        .transpose()?;
    Ok(ImageThreadCreation {
        thread_id,
        brain_job_id,
        ocr_job_id,
    })
}

pub async fn create_sidechat_thread(
    selected_model: String,
    message_markdown: String,
    attachment_inputs: Vec<MessageAttachmentInput>,
    text_citations: Vec<MessageTextCitation>,
    human_text: Option<String>,
    message_context: Option<serde_json::Value>,
) -> ThreadResult<SideChatCreation> {
    let credential = brain()
        .capture_image_thread_credential(selected_model)
        .await?;
    validate_message_inputs(&message_markdown, &attachment_inputs, &text_citations)?;
    let human_text = human_text
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let (sidechat_id, initial_title) = tokio::task::spawn_blocking(move || {
        let _index_guard = thread_index_lock()
            .lock()
            .map_err(|_| "Thread index is unavailable".to_string())?;
        let storage = active_storage()?;
        let metadata = SideChatMetadata::new(DEFAULT_SIDE_CHAT_TITLE.to_string());
        let attachments = message_attachments(attachment_inputs.clone());
        let message = ThreadMessage::user_with_attachments(message_markdown, attachments)
            .with_text_citations(text_citations)
            .with_message_context(message_context);
        let mut sidechat = SideChatData::new(metadata.clone(), message);
        for input in attachment_inputs {
            let mut entry = storage
                .attachment_manifest_entry(
                    &input.attachment_hash,
                    input.display_name.as_deref().unwrap_or("attachment"),
                    Utc::now(),
                )
                .map_err(|error| error.to_string())?;
            if let Some(file_type) = input.file_type {
                entry.file_type = file_type;
            }
            sidechat.attachment_manifest.push(entry);
        }
        storage
            .save_sidechat(&sidechat)
            .map_err(|error| error.to_string())?;
        Ok::<_, String>((metadata.id, metadata.title))
    })
    .await
    .map_err(|error| format!("SideChat creation task failed: {error}"))??;

    if let (Some(title_source), Some(credential)) = (human_text, credential) {
        let metadata_id = sidechat_id.clone();
        tokio::spawn(async move {
            if let Ok(title) = brain()
                .initial_sidechat_title(metadata_id.clone(), title_source, credential)
                .await
            {
                let _ = tokio::task::spawn_blocking(move || {
                    let _index_guard = thread_index_lock()
                        .lock()
                        .map_err(|_| "Thread index is unavailable".to_string())?;
                    let storage = active_storage()?;
                    let mut sidechat = storage
                        .load_sidechat(&metadata_id)
                        .map_err(|error| error.to_string())?;
                    if sidechat.metadata.title != DEFAULT_SIDE_CHAT_TITLE {
                        return Ok::<_, String>(());
                    }
                    sidechat.metadata.title = title;
                    sidechat.metadata.updated_at = Utc::now();
                    storage
                        .update_sidechat_metadata(&sidechat.metadata)
                        .map_err(|error| error.to_string())
                })
                .await;
            }
        });
    }
    Ok(SideChatCreation {
        sidechat_id,
        title: initial_title,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAttachment {
    pub attachment_hash: String,
    pub cas_path: String,
    pub file_type: AttachmentFileType,
    pub preview_path: Option<String>,
}
pub fn add_local_attachment(source_path: &str) -> ThreadResult<LocalAttachment> {
    let storage = active_storage()?;
    if is_supported_image(Path::new(source_path)) {
        let stored = crate::harness::images::store_image_rendition(
            &std::fs::read(source_path).map_err(|error| error.to_string())?,
        )?;
        return Ok(LocalAttachment {
            attachment_hash: stored.hash,
            cas_path: stored.cas_path,
            file_type: AttachmentFileType::Image,
            preview_path: None,
        });
    }
    let stored = storage
        .store_file_from_path(source_path, None)
        .map_err(|e| e.to_string())?;
    let file_type = storage
        .load_object_manifest(&stored.hash)
        .map_err(|e| e.to_string())?
        .file_context
        .file_type;
    let parsed = crate::harness::parser::media::prepare(
        &stored.hash,
        &crate::harness::parser::ParseControl::default(),
    )
    .map_err(|e| e.to_string())?;
    Ok(LocalAttachment {
        attachment_hash: stored.hash.clone(),
        cas_path: stored.path,
        file_type: file_type.clone(),
        preview_path: if file_type == AttachmentFileType::Document {
            Some(
                crate::harness::parser::media::document_path(&stored.hash)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .into_owned(),
            )
        } else {
            parsed
                .poster
                .map(|path| path.to_string_lossy().into_owned())
        },
    })
}
pub fn document_preview_path(path: &str) -> ThreadResult<String> {
    let stored = active_storage()?
        .store_file_from_path(path, None)
        .map_err(|e| e.to_string())?;
    crate::harness::parser::media::document_path(&stored.hash)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}
pub fn media_playback_path(path: &str) -> ThreadResult<String> {
    let stored = active_storage()?
        .store_file_from_path(path, None)
        .map_err(|e| e.to_string())?;
    crate::harness::parser::media::playback(
        &stored.hash,
        &crate::harness::parser::ParseControl::default(),
    )
    .map(|path| path.to_string_lossy().into_owned())
    .map_err(|error| error.to_string())
}
fn validate_message_inputs(
    _message: &str,
    inputs: &[MessageAttachmentInput],
    _citations: &[MessageTextCitation],
) -> ThreadResult<()> {
    let storage = active_storage()?;
    for input in inputs {
        let object = storage
            .load_object_manifest(&input.attachment_hash)
            .map_err(|e| e.to_string())?;
        if input
            .file_type
            .as_ref()
            .is_some_and(|kind| kind != &object.file_context.file_type)
        {
            return Err("Attachment type does not match its stored object".into());
        }
        storage
            .find_object_blob(&input.attachment_hash)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn message_attachments(inputs: Vec<MessageAttachmentInput>) -> Vec<MessageAttachment> {
    inputs
        .into_iter()
        .map(|input| MessageAttachment {
            attachment_hash: input.attachment_hash,
            source_path: input.source_path,
        })
        .collect()
}

fn manifest_mentions(inputs: &[MessageAttachmentInput]) -> Vec<ManifestMention> {
    inputs
        .iter()
        .map(|input| ManifestMention {
            attachment_hash: input.attachment_hash.clone(),
            display_name: input.display_name.clone(),
            file_type: input.file_type.clone(),
        })
        .collect()
}

/// Append a user message to any conversation by id alone, persisting it to
/// messages.json and merging its attachment mentions into the manifest.
pub fn append_message(
    conversation_id: &str,
    message_markdown: String,
    attachments: Vec<MessageAttachmentInput>,
    text_citations: Vec<MessageTextCitation>,
    message_context: Option<serde_json::Value>,
) -> ThreadResult<ThreadMessage> {
    validate_message_inputs(&message_markdown, &attachments, &text_citations)?;
    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    if brain().jobs_snapshot().iter().any(|job| {
        job.thread_id == conversation_id && job.task == "conversation" && !job.is_terminal()
    }) {
        return Err(
            "Wait for the current response or stop it before sending another message.".to_string(),
        );
    }
    let storage = active_storage()?;
    let message = ThreadMessage::user_with_attachments(
        message_markdown,
        message_attachments(attachments.clone()),
    )
    .with_text_citations(text_citations)
    .with_message_context(message_context);
    let mentions = manifest_mentions(&attachments);
    storage
        .push_message(conversation_id, message.clone(), &mentions)
        .map_err(|error| error.to_string())?;
    Ok(message)
}

/// Append an assistant message to any conversation by id alone.
pub fn append_assistant_message(
    conversation_id: &str,
    content: String,
    citations: Vec<crate::storage::CitationSource>,
    error: Option<AssistantError>,
    grounding: Option<MessageGrounding>,
) -> ThreadResult<ThreadMessage> {
    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let storage = active_storage()?;
    let mut message = match error {
        Some(error) => ThreadMessage::assistant_error(content, error),
        None => ThreadMessage::assistant(content),
    }
    .with_grounding(grounding);
    if let ThreadMessage::Assistant {
        citations: sources, ..
    } = &mut message
    {
        *sources = citations;
    }
    storage
        .push_message(conversation_id, message.clone(), &[])
        .map_err(|error| error.to_string())?;
    Ok(message)
}

/// Remove one message and every message after it from any conversation.
pub fn remove_messages_from(conversation_id: &str, from_message_id: &str) -> ThreadResult<()> {
    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let storage = active_storage()?;
    storage
        .truncate_messages(conversation_id, from_message_id)
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// One manifest entry with its on-disk blob location for shell display.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationAttachment {
    pub attachment_hash: String,
    pub display_name: String,
    pub file_type: String,
    pub blob_path: Option<String>,
    pub preview_path: Option<String>,
}

/// Persisted conversation state for one thread or sidechat.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSnapshot {
    pub messages: Vec<ThreadMessage>,
    pub manifest: Vec<ConversationAttachment>,
}

fn conversation_snapshot(
    storage: &ThreadStorage,
    conversation: &storage::Conversation,
) -> ConversationSnapshot {
    let attachments = conversation
        .manifest()
        .iter()
        .map(|entry| ConversationAttachment {
            attachment_hash: entry.attachment_hash.clone(),
            display_name: entry.display_name.clone(),
            file_type: match entry.file_type {
                AttachmentFileType::Image => "image".to_string(),
                AttachmentFileType::Document => "document".to_string(),
                AttachmentFileType::Video => "video".to_string(),
                AttachmentFileType::Audio => "audio".to_string(),
            },
            preview_path: crate::harness::parser::media::load_index(&entry.attachment_hash)
                .ok()
                .flatten()
                .and_then(|index| index.poster.map(|p| p.to_string_lossy().into_owned())),
            blob_path: storage
                .find_object_blob(&entry.attachment_hash)
                .ok()
                .and_then(|path| path.to_str().map(str::to_string)),
        })
        .collect();
    ConversationSnapshot {
        messages: conversation.messages().to_vec(),
        manifest: attachments,
    }
}

/// Load the persisted conversation of any thread or sidechat by id alone.
pub fn load_conversation(conversation_id: &str) -> ThreadResult<ConversationSnapshot> {
    let storage = active_storage()?;
    let conversation = storage
        .load_conversation(conversation_id)
        .map_err(|error| error.to_string())?;
    Ok(conversation_snapshot(&storage, &conversation))
}

pub fn get_thread_jobs_snapshot() -> ThreadResult<Vec<crate::brain::JobSnapshot>> {
    Ok(brain().jobs_snapshot())
}

pub fn get_conversation_job(job_id: &str) -> Option<crate::brain::JobSnapshot> {
    brain().job_snapshot(job_id)
}

pub fn cancel_brain_job(job_id: &str) {
    brain().cancel_job(job_id);
}

pub fn cancel_title_jobs(conversation_id: &str) {
    for job in brain().jobs_snapshot() {
        if job.thread_id == conversation_id && job.task == "title" && !job.is_terminal() {
            brain().cancel_job(&job.job_id);
        }
    }
}

pub fn start_conversation_response(
    conversation_id: &str,
    model: String,
    effort: String,
    force_web_search: bool,
) -> ThreadResult<String> {
    start_conversation_response_with_snapshot(
        conversation_id,
        model,
        effort,
        force_web_search,
        None,
    )
}

fn start_conversation_response_with_snapshot(
    conversation_id: &str,
    model: String,
    effort: String,
    force_web_search: bool,
    credential: Option<ImageThreadCredentialSnapshot>,
) -> ThreadResult<String> {
    let conversation = active_storage()?
        .load_conversation(conversation_id)
        .map_err(|error| error.to_string())?;
    let profile = crate::profile::get_profile_snapshot()
        .map_err(|error| error.to_string())?
        .active_profile;
    let identity = serde_json::json!({
        "name": profile.as_ref().map(|profile| &profile.name),
        "email": profile.as_ref().map(|profile| &profile.email),
        "machine": crate::machine::get_machine_info(),
        "local_time": chrono::Local::now().to_rfc3339(),
        "persona": settings::load_persona()?,
    });
    let job_id = format!(
        "conversation-{}-{}",
        conversation_id,
        NEXT_IMAGE_THREAD_CREATION_ID.fetch_add(1, Ordering::Relaxed)
    );
    brain().start_conversation_with_snapshot(
        job_id,
        crate::brain::ConversationRequest {
            conversation,
            model,
            effort,
            user_identity: identity,
            force_web_search,
        },
        credential,
    )
}

pub async fn generate_conversation_response(
    conversation_id: &str,
    model: String,
    effort: String,
    force_web_search: bool,
) -> ThreadResult<String> {
    let job_id = start_conversation_response(conversation_id, model, effort, force_web_search)?;
    await_conversation_response(conversation_id, &job_id).await
}

pub async fn await_conversation_response(
    conversation_id: &str,
    job_id: &str,
) -> ThreadResult<String> {
    loop {
        let snapshot = brain()
            .job_snapshot(job_id)
            .ok_or("Response job is unavailable")?;
        if snapshot.thread_id != conversation_id || snapshot.task != "conversation" {
            return Err("Response job belongs to another conversation".to_string());
        }
        if snapshot.is_terminal() {
            let content = snapshot.content.unwrap_or_else(|| {
                snapshot
                    .error
                    .as_ref()
                    .map(|error| error.message.clone())
                    .unwrap_or_default()
            });
            append_assistant_message(
                conversation_id,
                content.clone(),
                snapshot.citations,
                snapshot.error,
                Some(snapshot.grounding),
            )?;
            return Ok(content);
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

pub mod lens {
    use crate::auth::{get_decrypted_api_key, session_api_keys_active, ApiKeyProvider};
    use crate::storage::{self, OcrAnnotationEntry, ReverseImageSearchCache, ThreadStorage};
    use serde::{Deserialize, Serialize};
    use std::{
        collections::HashMap,
        path::Path,
        sync::{
            atomic::{AtomicU64, Ordering},
            Mutex, OnceLock,
        },
    };
    use tokio::sync::watch;
    use url::Url;

    use super::{active_storage, ThreadResult};

    struct ReverseSearchCancellation {
        id: u64,
        sender: watch::Sender<bool>,
    }

    static REVERSE_SEARCH_CANCELLATIONS: OnceLock<
        Mutex<HashMap<String, ReverseSearchCancellation>>,
    > = OnceLock::new();
    static NEXT_REVERSE_SEARCH_ID: AtomicU64 = AtomicU64::new(1);

    fn reverse_search_cancellations() -> &'static Mutex<HashMap<String, ReverseSearchCancellation>>
    {
        REVERSE_SEARCH_CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn begin_reverse_search(thread_id: &str) -> ThreadResult<(u64, watch::Receiver<bool>)> {
        let id = NEXT_REVERSE_SEARCH_ID.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = watch::channel(false);
        let previous = reverse_search_cancellations()
            .lock()
            .map_err(|_| "Reverse image search cancellation lock poisoned".to_string())?
            .insert(
                thread_id.to_string(),
                ReverseSearchCancellation { id, sender },
            );
        if let Some(previous) = previous {
            let _ = previous.sender.send(true);
        }
        Ok((id, receiver))
    }

    fn finish_reverse_search(thread_id: &str, id: u64) -> ThreadResult<()> {
        let mut cancellations = reverse_search_cancellations()
            .lock()
            .map_err(|_| "Reverse image search cancellation lock poisoned".to_string())?;
        if cancellations
            .get(thread_id)
            .is_some_and(|cancellation| cancellation.id == id)
        {
            cancellations.remove(thread_id);
        }
        Ok(())
    }

    pub fn cancel_reverse_image_search(thread_id: &str) -> ThreadResult<()> {
        let cancellation = reverse_search_cancellations()
            .lock()
            .map_err(|_| "Reverse image search cancellation lock poisoned".to_string())?
            .remove(thread_id);
        if let Some(cancellation) = cancellation {
            let _ = cancellation.sender.send(true);
        }
        Ok(())
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ReverseImageSearchOutcome {
        pub imgbb_url: String,
        pub google_lens_url: String,
        pub opened_url: String,
    }

    fn required_text<'a>(text: &'a str, message: &str) -> ThreadResult<&'a str> {
        let text = text.trim();
        if text.is_empty() {
            Err(message.to_string())
        } else {
            Ok(text)
        }
    }

    fn translate_url(text: &str) -> ThreadResult<String> {
        let mut url =
            Url::parse("https://translate.google.com/").map_err(|error| error.to_string())?;
        url.query_pairs_mut()
            .append_pair("text", required_text(text, "Translation text is required")?)
            .append_pair("sl", "auto")
            .append_pair("tl", "en")
            .append_pair("op", "translate");
        Ok(url.into())
    }

    pub fn search_text_url(text: &str) -> ThreadResult<String> {
        let mut url =
            Url::parse("https://www.google.com/search").map_err(|error| error.to_string())?;
        url.query_pairs_mut()
            .append_pair("q", required_text(text, "Search text is required")?);
        Ok(url.into())
    }

    pub fn translate_text_url(text: &str) -> ThreadResult<String> {
        translate_url(text)
    }

    fn latest_ocr_text(thread_id: &str, storage: &ThreadStorage) -> ThreadResult<String> {
        let thread = storage
            .load_thread(thread_id)
            .map_err(|error| error.to_string())?;
        let latest = thread
            .ocr_data
            .values()
            .filter_map(|entry| match entry {
                OcrAnnotationEntry::Model(model) => model
                    .scanned_at
                    .as_ref()
                    .map(|scanned_at| (scanned_at, &model.ocr_data)),
                OcrAnnotationEntry::EmptyState(_) => None,
            })
            .max_by(|left, right| left.0.cmp(right.0))
            .ok_or_else(|| "OCR has not completed for this thread".to_string())?;
        let text = latest
            .1
            .iter()
            .map(|region| region.text.trim())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        required_text(&text, "OCR completed without translatable text").map(str::to_string)
    }

    pub fn translate_thread_image_url(thread_id: &str) -> ThreadResult<String> {
        let storage = active_storage()?;
        translate_url(&latest_ocr_text(thread_id, &storage)?)
    }

    fn lens_url(image_url: &str) -> ThreadResult<String> {
        let mut url =
            Url::parse("https://lens.google.com/uploadbyurl").map_err(|error| error.to_string())?;
        url.query_pairs_mut()
            .append_pair("url", required_text(image_url, "ImgBB URL is required")?)
            .append_pair("ep", "subb")
            .append_pair("re", "df")
            .append_pair("s", "4")
            .append_pair("hl", "en")
            .append_pair("gl", "US");
        Ok(url.into())
    }

    fn complete_cache(cache: ReverseImageSearchCache) -> (String, String) {
        (cache.imgbb_url, cache.google_lens_url)
    }

    pub fn is_thread_image_hosted(thread_id: &str) -> ThreadResult<bool> {
        let storage = active_storage()?;
        let thread = storage
            .load_thread(thread_id)
            .map_err(|error| error.to_string())?;
        storage
            .get_reverse_image_search_cache(&thread.metadata.image_hash)
            .map(|cache| cache.is_some())
            .map_err(|error| error.to_string())
    }

    #[derive(Deserialize)]
    struct ImgBbUploadResponse {
        success: bool,
        data: Option<ImgBbUploadData>,
        error: Option<ImgBbUploadError>,
    }

    #[derive(Deserialize)]
    struct ImgBbUploadData {
        url: Option<String>,
    }

    #[derive(Deserialize)]
    struct ImgBbUploadError {
        message: Option<String>,
    }

    async fn upload_image(image_path: &Path, api_key: &str) -> ThreadResult<String> {
        let bytes = tokio::fs::read(image_path)
            .await
            .map_err(|error| error.to_string())?;
        if bytes.is_empty() {
            return Err("Image file is empty".to_string());
        }
        let file_name = image_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("image")
            .to_string();
        let mime = mime_guess::from_path(image_path).first_or_octet_stream();
        let image = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(mime.essence_str())
            .map_err(|error| error.to_string())?;
        let response = reqwest::Client::new()
            .post("https://api.imgbb.com/1/upload")
            .query(&[("key", api_key)])
            .multipart(reqwest::multipart::Form::new().part("image", image))
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let status = response.status();
        let body = response.text().await.map_err(|error| error.to_string())?;
        if !status.is_success() {
            return Err(format!("ImgBB upload failed with status {status}"));
        }
        let parsed = serde_json::from_str::<ImgBbUploadResponse>(&body)
            .map_err(|error| error.to_string())?;
        if !parsed.success {
            return Err(parsed
                .error
                .and_then(|error| error.message)
                .unwrap_or_else(|| "ImgBB upload was not successful".to_string()));
        }
        parsed
            .data
            .and_then(|data| data.url)
            .ok_or_else(|| "ImgBB response did not contain an image URL".to_string())
    }

    async fn run_reverse_image_search_url(
        thread_id: &str,
        query: Option<&str>,
    ) -> ThreadResult<ReverseImageSearchOutcome> {
        let storage = active_storage()?;
        let thread = storage
            .load_thread(thread_id)
            .map_err(|error| error.to_string())?;
        let hash = thread.metadata.image_hash;
        let cached = storage
            .get_reverse_image_search_cache(&hash)
            .map_err(|error| error.to_string())?;
        let (imgbb_url, google_lens_url) = match cached.map(complete_cache) {
            Some(cache) => cache,
            None => {
                let credential = tokio::task::spawn_blocking(|| {
                    let profiles = storage::profile_store().map_err(|error| error.to_string())?;
                    let profile_id = profiles
                        .get_active_profile_id()
                        .map_err(|error| error.to_string())?
                        .ok_or_else(|| {
                            if session_api_keys_active() {
                                "ImgBB is unavailable. Set IMGBB_API_KEY in the shell or repo .env."
                                    .to_string()
                            } else {
                                "An active profile is required for reverse image search".to_string()
                            }
                        })?;
                    get_decrypted_api_key(&profiles, ApiKeyProvider::ImgBb, &profile_id)
                        .map_err(|error| error.to_string())?
                        .ok_or_else(|| {
                            if session_api_keys_active() {
                                "ImgBB is unavailable. Set IMGBB_API_KEY in the shell or repo .env."
                                    .to_string()
                            } else {
                                "ImgBB key is not configured".to_string()
                            }
                        })
                })
                .await
                .map_err(|error| error.to_string())??;
                let image_path = storage
                    .find_object_blob(&hash)
                    .map_err(|error| error.to_string())?;
                let imgbb_url = upload_image(&image_path, credential.api_key.expose()).await?;
                let google_lens_url = lens_url(&imgbb_url)?;
                storage
                    .save_reverse_image_search_cache(
                        &hash,
                        imgbb_url.clone(),
                        google_lens_url.clone(),
                    )
                    .map_err(|error| error.to_string())?;
                (imgbb_url, google_lens_url)
            }
        };
        let mut opened = Url::parse(&google_lens_url).map_err(|error| error.to_string())?;
        if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
            opened.query_pairs_mut().append_pair("q", query);
        }
        Ok(ReverseImageSearchOutcome {
            imgbb_url,
            google_lens_url,
            opened_url: opened.into(),
        })
    }

    pub async fn reverse_image_search_url(
        thread_id: &str,
        query: Option<&str>,
    ) -> ThreadResult<ReverseImageSearchOutcome> {
        let (search_id, mut cancellation) = begin_reverse_search(thread_id)?;
        let result = tokio::select! {
            _ = cancellation.changed() => Err("Reverse image search cancelled".to_string()),
            result = run_reverse_image_search_url(thread_id, query) => result,
        };
        finish_reverse_search(thread_id, search_id)?;
        result
    }
}

pub mod ocr {
    use serde::Serialize;
    use squigit_ocr::models::DEFAULT_OCR_MODEL_ID;
    use squigit_ocr::ocr::{persist_boxes_to_thread_storage, OcrRequest};
    use std::collections::BTreeMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use tokio::sync::Mutex as AsyncMutex;

    use crate::services::{ocr, ocr_models};

    use super::{active_storage, ThreadResult};

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct OcrThreadSnapshot {
        pub thread_id: String,
        pub thread_title: String,
        pub image_path: String,
        pub image_hash: String,
        pub image_tone: Option<String>,
        pub ocr_data: crate::storage::OcrAnnotations,
    }

    #[derive(Clone)]
    struct OcrJobRecord {
        job_id: String,
        thread_id: String,
        model_id: String,
        status: String,
        output: Option<String>,
        error: Option<String>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct OcrJobSnapshot {
        pub job_id: String,
        pub thread_id: String,
        pub model_id: String,
        pub status: String,
        pub has_output: bool,
        pub error: Option<String>,
    }

    impl From<&OcrJobRecord> for OcrJobSnapshot {
        fn from(job: &OcrJobRecord) -> Self {
            Self {
                job_id: job.job_id.clone(),
                thread_id: job.thread_id.clone(),
                model_id: job.model_id.clone(),
                status: job.status.clone(),
                has_output: job.output.is_some(),
                error: job.error.clone(),
            }
        }
    }

    static OCR_JOBS: OnceLock<Arc<Mutex<BTreeMap<u64, OcrJobRecord>>>> = OnceLock::new();
    static OCR_JOB_RUN_LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
    static NEXT_OCR_JOB_ID: AtomicU64 = AtomicU64::new(1);

    fn lock_jobs(
        jobs: &Mutex<BTreeMap<u64, OcrJobRecord>>,
    ) -> ThreadResult<std::sync::MutexGuard<'_, BTreeMap<u64, OcrJobRecord>>> {
        jobs.lock()
            .map_err(|_| "OCR job queue state is unavailable".to_string())
    }

    fn ocr_job_sequence(job_id: &str) -> Option<u64> {
        job_id.strip_prefix("ocr-")?.parse().ok()
    }

    fn ocr_jobs() -> &'static Arc<Mutex<BTreeMap<u64, OcrJobRecord>>> {
        OCR_JOBS.get_or_init(|| Arc::new(Mutex::new(BTreeMap::new())))
    }

    fn ocr_job_run_lock() -> &'static AsyncMutex<()> {
        OCR_JOB_RUN_LOCK.get_or_init(|| AsyncMutex::new(()))
    }

    pub fn load_ocr_thread(thread_id: &str) -> ThreadResult<OcrThreadSnapshot> {
        let storage = active_storage()?;
        let thread = storage
            .load_thread(thread_id)
            .map_err(|error| error.to_string())?;
        let image_path = storage
            .image_blob_path(&thread.metadata.image_blob)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .to_string();
        Ok(OcrThreadSnapshot {
            thread_id: thread_id.to_string(),
            thread_title: thread.metadata.title,
            image_path,
            image_hash: thread.metadata.image_hash,
            image_tone: thread.image_tone,
            ocr_data: thread.ocr_data,
        })
    }

    fn sidecar_request(image_path: String, model_id: &str) -> ThreadResult<OcrRequest> {
        let sidecar_path = squigit_ocr::sidecar::resolve_sidecar_path();
        let rec_model_dir_override = (model_id != DEFAULT_OCR_MODEL_ID)
            .then(|| ocr_models().map(|models| models.get_model_dir(model_id)))
            .transpose()?;
        Ok(OcrRequest {
            sidecar_path,
            image_path: PathBuf::from(image_path),
            rec_model_dir_override,
        })
    }

    async fn run_ocr_thread_job(thread_id: &str, model_id: &str) -> ThreadResult<String> {
        let storage = active_storage()?;
        let thread = storage
            .load_thread(thread_id)
            .map_err(|error| error.to_string())?;
        let image_path = storage
            .image_blob_path(&thread.metadata.image_blob)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .to_string();
        let request = sidecar_request(image_path, model_id)?;
        let result = ocr()
            .run(request)
            .await
            .map_err(|error| error.to_string())?;
        persist_boxes_to_thread_storage(&storage, thread_id, model_id, &result.boxes)
            .map_err(|error| error.to_string())?;
        serde_json::to_string(
            &storage
                .get_ocr_annotations(thread_id)
                .map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    }

    async fn run_queued_ocr_job(sequence: u64, jobs: Arc<Mutex<BTreeMap<u64, OcrJobRecord>>>) {
        let _queue_guard = ocr_job_run_lock().lock().await;
        let request = {
            let Ok(mut records) = lock_jobs(&jobs) else {
                return;
            };
            let Some(job) = records.get_mut(&sequence) else {
                return;
            };
            if job.status == "cancelled" {
                return;
            }
            job.status = "running".to_string();
            (job.thread_id.clone(), job.model_id.clone())
        };

        let result = run_ocr_thread_job(&request.0, &request.1).await;
        let Ok(mut records) = lock_jobs(&jobs) else {
            return;
        };
        let Some(job) = records.get_mut(&sequence) else {
            return;
        };
        if job.status == "cancelled" {
            return;
        }
        match result {
            Ok(output) => {
                job.status = "completed".to_string();
                job.output = Some(output);
                job.error = None;
            }
            Err(error) => {
                job.status = "failed".to_string();
                job.error = Some(error);
            }
        }
    }

    fn spawn_ocr_job(sequence: u64, jobs: Arc<Mutex<BTreeMap<u64, OcrJobRecord>>>) {
        let worker_jobs = Arc::clone(&jobs);
        let worker = tokio::spawn(async move {
            run_queued_ocr_job(sequence, worker_jobs).await;
        });
        tokio::spawn(async move {
            let Err(error) = worker.await else {
                return;
            };
            if let Ok(mut records) = lock_jobs(&jobs) {
                if let Some(job) = records.get_mut(&sequence) {
                    if job.status != "cancelled" {
                        job.status = "failed".to_string();
                        job.error = Some(format!("OCR job worker crashed: {error}"));
                    }
                }
            }
        });
    }

    pub fn start_ocr_thread_job(thread_id: &str, model_id: &str) -> ThreadResult<String> {
        let jobs = ocr_jobs();
        {
            let records = lock_jobs(jobs)?;
            if let Some(existing) = records.values().rev().find(|job| {
                job.thread_id == thread_id
                    && job.model_id == model_id
                    && matches!(job.status.as_str(), "queued" | "running")
            }) {
                return Ok(existing.job_id.clone());
            }
        }

        let sequence = NEXT_OCR_JOB_ID.fetch_add(1, Ordering::Relaxed);
        let job_id = format!("ocr-{sequence}");
        {
            let mut records = lock_jobs(jobs)?;
            records.insert(
                sequence,
                OcrJobRecord {
                    job_id: job_id.clone(),
                    thread_id: thread_id.to_string(),
                    model_id: model_id.to_string(),
                    status: "queued".to_string(),
                    output: None,
                    error: None,
                },
            );
        }
        spawn_ocr_job(sequence, Arc::clone(jobs));
        Ok(job_id)
    }

    pub fn get_ocr_jobs_snapshot() -> ThreadResult<Vec<OcrJobSnapshot>> {
        if let Some(jobs) = OCR_JOBS.get() {
            Ok(lock_jobs(jobs)?
                .values()
                .map(OcrJobSnapshot::from)
                .collect())
        } else {
            Ok(Vec::new())
        }
    }

    pub fn get_ocr_job_output(job_id: &str) -> ThreadResult<Option<String>> {
        let Some(jobs) = OCR_JOBS.get() else {
            return Ok(None);
        };
        let Some(sequence) = ocr_job_sequence(job_id) else {
            return Ok(None);
        };
        Ok(lock_jobs(jobs)?
            .get(&sequence)
            .and_then(|job| job.output.clone()))
    }

    pub async fn cancel_ocr_job(job_id: &str) -> ThreadResult<()> {
        let Some(jobs) = OCR_JOBS.get() else {
            return Ok(());
        };
        let Some(sequence) = ocr_job_sequence(job_id) else {
            return Ok(());
        };
        let was_running = {
            let mut records = lock_jobs(jobs)?;
            let Some(job) = records.get_mut(&sequence) else {
                return Ok(());
            };
            if matches!(job.status.as_str(), "completed" | "failed" | "cancelled") {
                return Ok(());
            }
            let was_running = job.status == "running";
            job.status = "cancelled".to_string();
            was_running
        };
        if was_running {
            ocr()
                .cancel_current_job()
                .await
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}
