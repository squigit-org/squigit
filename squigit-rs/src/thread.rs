// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::brain::ImageThreadCredentialSnapshot;
use crate::storage::{
    self, AssistantError, AttachmentFileType, ManifestMention, MessageAttachment, SideChatData,
    SideChatMetadata, ThreadData, ThreadMessage, ThreadMetadata, ThreadStorage,
    DEFAULT_SIDE_CHAT_TITLE, DEFAULT_THREAD_TITLE,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
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

#[derive(Clone)]
struct BrainJobRecord {
    job_id: String,
    thread_id: String,
    status: String,
    phase: String,
    error: Option<String>,
}

struct PendingImageThreadCredential {
    credential: Option<ImageThreadCredentialSnapshot>,
    captured_at: Instant,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainJobSnapshot {
    pub job_id: String,
    pub thread_id: String,
    pub status: String,
    pub phase: String,
    pub error: Option<String>,
}

impl From<&BrainJobRecord> for BrainJobSnapshot {
    fn from(job: &BrainJobRecord) -> Self {
        Self {
            job_id: job.job_id.clone(),
            thread_id: job.thread_id.clone(),
            status: job.status.clone(),
            phase: job.phase.clone(),
            error: job.error.clone(),
        }
    }
}

static BRAIN_JOBS: OnceLock<Arc<Mutex<BTreeMap<u64, BrainJobRecord>>>> = OnceLock::new();
static NEXT_BRAIN_JOB_ID: AtomicU64 = AtomicU64::new(1);
static PENDING_IMAGE_THREAD_CREDENTIALS: OnceLock<
    Mutex<BTreeMap<String, PendingImageThreadCredential>>,
> = OnceLock::new();
static NEXT_IMAGE_THREAD_CREATION_ID: AtomicU64 = AtomicU64::new(1);
static THREAD_INDEX_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const IMAGE_THREAD_CREATION_TTL: Duration = Duration::from_secs(10 * 60);

pub(super) fn active_storage() -> ThreadResult<ThreadStorage> {
    storage::thread_store().map_err(|error| error.to_string())
}

fn brain_jobs() -> &'static Arc<Mutex<BTreeMap<u64, BrainJobRecord>>> {
    BRAIN_JOBS.get_or_init(|| Arc::new(Mutex::new(BTreeMap::new())))
}

fn pending_image_thread_credentials(
) -> &'static Mutex<BTreeMap<String, PendingImageThreadCredential>> {
    PENDING_IMAGE_THREAD_CREDENTIALS.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn lock_brain_jobs(
    jobs: &Mutex<BTreeMap<u64, BrainJobRecord>>,
) -> ThreadResult<std::sync::MutexGuard<'_, BTreeMap<u64, BrainJobRecord>>> {
    jobs.lock()
        .map_err(|_| "Thread job state is unavailable".to_string())
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
    let credential = brain().capture_image_thread_credential().await?;
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

fn is_supported_image(path: &Path) -> bool {
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

fn create_thread_on_disk(
    source_path: &str,
    workspace_id: Option<&str>,
) -> ThreadResult<(String, String)> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err("The pasted image file could not be found".to_string());
    }
    if !is_supported_image(source) {
        return Err("Thread creation requires a supported image file".to_string());
    }
    let image_tone = lens::detect_image_tone_from_path(source)?;

    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let storage = active_storage()?;
    let stored = storage
        .store_image_from_path(source_path, image_tone)
        .map_err(|error| error.to_string())?;
    let display_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pasted-image.png");
    let metadata = ThreadMetadata::new(DEFAULT_THREAD_TITLE.to_string(), stored.hash);
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
    Ok((metadata.id, stored.path))
}

fn update_brain_job(
    jobs: &Mutex<BTreeMap<u64, BrainJobRecord>>,
    sequence: u64,
    status: &str,
    phase: &str,
    error: Option<String>,
) {
    if let Ok(mut records) = lock_brain_jobs(jobs) {
        if let Some(job) = records.get_mut(&sequence) {
            job.status = status.to_string();
            job.phase = phase.to_string();
            job.error = error;
        }
    }
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

async fn run_brain_job(
    sequence: u64,
    jobs: Arc<Mutex<BTreeMap<u64, BrainJobRecord>>>,
    thread_id: String,
    image_path: String,
    model: String,
    effort: String,
    credential: ImageThreadCredentialSnapshot,
) {
    update_brain_job(&jobs, sequence, "running", "uploading", None);
    let result = async {
        let uploaded = brain()
            .ensure_thread_image_uploaded_with_snapshot(&credential, image_path)
            .await?;
        update_brain_job(&jobs, sequence, "running", "generating-title", None);
        let model_candidates = brain().build_model_attempt_plan(model, effort).await?;
        let title = brain()
            .suggest_thread_title_from_file_with_snapshot(&credential, uploaded, model_candidates)
            .await?;
        let title_thread_id = thread_id.clone();
        tokio::task::spawn_blocking(move || persist_generated_title(&title_thread_id, &title))
            .await
            .map_err(|error| format!("Thread title save task failed: {error}"))??;
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => update_brain_job(&jobs, sequence, "completed", "completed", None),
        Err(error) => update_brain_job(&jobs, sequence, "failed", "failed", Some(error)),
    }
}

fn start_brain_job(
    thread_id: String,
    image_path: String,
    model: String,
    effort: String,
    credential: ImageThreadCredentialSnapshot,
) -> ThreadResult<String> {
    let sequence = NEXT_BRAIN_JOB_ID.fetch_add(1, Ordering::Relaxed);
    let job_id = format!("brain-{sequence}");
    let jobs = brain_jobs();
    lock_brain_jobs(jobs)?.insert(
        sequence,
        BrainJobRecord {
            job_id: job_id.clone(),
            thread_id: thread_id.clone(),
            status: "queued".to_string(),
            phase: "stored".to_string(),
            error: None,
        },
    );
    let worker_jobs = Arc::clone(jobs);
    let crash_jobs = Arc::clone(jobs);
    let worker = tokio::spawn(async move {
        run_brain_job(
            sequence,
            worker_jobs,
            thread_id,
            image_path,
            model,
            effort,
            credential,
        )
        .await;
    });
    tokio::spawn(async move {
        if let Err(error) = worker.await {
            update_brain_job(
                &crash_jobs,
                sequence,
                "failed",
                "failed",
                Some(format!("Thread job worker crashed: {error}")),
            );
        }
    });
    Ok(job_id)
}

pub async fn create_image_thread(
    creation_id: String,
    source_path: String,
    workspace_id: Option<String>,
) -> ThreadResult<ImageThreadCreation> {
    let credential = take_image_thread_credential(&creation_id)?;
    let config = settings::load_config()?;
    let creation_workspace_id = workspace_id.clone();
    let (thread_id, image_path) = tokio::task::spawn_blocking(move || {
        create_thread_on_disk(&source_path, creation_workspace_id.as_deref())
    })
    .await
    .map_err(|error| format!("Thread creation task failed: {error}"))??;

    let brain_job_id = credential
        .map(|credential| {
            start_brain_job(
                thread_id.clone(),
                image_path,
                config.model,
                config.effort,
                credential,
            )
        })
        .transpose()?;
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
    message_markdown: String,
    attachment_inputs: Vec<MessageAttachmentInput>,
    human_text: Option<String>,
    message_context: Option<serde_json::Value>,
) -> ThreadResult<SideChatCreation> {
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

    let Some(title_source) = human_text else {
        return Ok(SideChatCreation {
            sidechat_id,
            title: initial_title,
        });
    };

    let generated_title = async {
        let config = settings::load_config()?;
        let candidates = brain()
            .build_model_attempt_plan(config.model, config.effort)
            .await?;
        brain()
            .suggest_thread_title_from_text(title_source, candidates)
            .await
    }
    .await;

    let title = match generated_title {
        Ok(title) if !title.trim().is_empty() => {
            let persisted_title = title.trim().to_string();
            let metadata_id = sidechat_id.clone();
            let next_title = persisted_title.clone();
            tokio::task::spawn_blocking(move || {
                let _index_guard = thread_index_lock()
                    .lock()
                    .map_err(|_| "Thread index is unavailable".to_string())?;
                let storage = active_storage()?;
                let mut sidechat = storage
                    .load_sidechat(&metadata_id)
                    .map_err(|error| error.to_string())?;
                sidechat.metadata.title = next_title;
                sidechat.metadata.updated_at = Utc::now();
                storage
                    .update_sidechat_metadata(&sidechat.metadata)
                    .map_err(|error| error.to_string())
            })
            .await
            .map_err(|error| format!("SideChat title save task failed: {error}"))??;
            persisted_title
        }
        _ => initial_title,
    };

    Ok(SideChatCreation { sidechat_id, title })
}

fn message_attachments(inputs: Vec<MessageAttachmentInput>) -> Vec<MessageAttachment> {
    inputs
        .into_iter()
        .map(|input| MessageAttachment {
            attachment_hash: input.attachment_hash,
            source_path: None,
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
    message_context: Option<serde_json::Value>,
) -> ThreadResult<ThreadMessage> {
    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let storage = active_storage()?;
    let message = ThreadMessage::user_with_attachments(
        message_markdown,
        message_attachments(attachments.clone()),
    )
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
    error: Option<AssistantError>,
) -> ThreadResult<ThreadMessage> {
    let _index_guard = thread_index_lock()
        .lock()
        .map_err(|_| "Thread index is unavailable".to_string())?;
    let storage = active_storage()?;
    let message = match error {
        Some(error) => ThreadMessage::assistant_error(content, error),
        None => ThreadMessage::assistant(content),
    };
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
                AttachmentFileType::TextLocal => "text-local".to_string(),
                AttachmentFileType::ImageUpload => "image-upload".to_string(),
                AttachmentFileType::DocumentUpload => "document-upload".to_string(),
                AttachmentFileType::TerminalMention => "terminal-mention".to_string(),
                AttachmentFileType::ThreadMention => "thread-mention".to_string(),
                AttachmentFileType::ForwardedMessages => "forwarded-messages".to_string(),
            },
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

pub fn get_thread_jobs_snapshot() -> ThreadResult<Vec<BrainJobSnapshot>> {
    if let Some(jobs) = BRAIN_JOBS.get() {
        Ok(lock_brain_jobs(jobs)?
            .values()
            .map(BrainJobSnapshot::from)
            .collect())
    } else {
        Ok(Vec::new())
    }
}

/// TEMPORARY DEV API SIMULATOR — remove the whole module when the real API
/// lands. Shells must treat everything in here as throwaway: the hardcoded
/// corpus, the weighted shuffle-bag picker, and the thinking-time constants.
/// Permanent behavior lives in the sibling `append_*` / `load_*` functions.
pub mod simulator {
    use std::sync::Mutex;
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use crate::storage::AssistantError;

    use super::ThreadResult;

    /// Thinking-time range in milliseconds. The GUI randomizes inside this
    /// range from TypeScript so tuning needs no backend rebuild; the CLI path
    /// below draws from the same range directly.
    pub const THINK_MIN_MS: u64 = 1000;
    pub const THINK_MAX_MS: u64 = 2500;

    struct SimulatedResponse {
        content: &'static str,
        weight: u32,
        web: bool,
        error: Option<(&'static str, &'static str)>,
    }

    struct PickerState {
        bag: Vec<usize>,
        last: Option<usize>,
        rng: u64,
    }

    static PICKER: Mutex<PickerState> = Mutex::new(PickerState {
        bag: Vec::new(),
        last: None,
        rng: 0,
    });

    const RESPONSES: &[SimulatedResponse] = &[
        SimulatedResponse {
            content: r##"# A closer look at your screenshot

The interface is using a **quiet visual hierarchy**: one primary surface, restrained borders, and a single accent color for interactive elements. The strongest part is that the eye lands on the content before it notices the chrome.

> The useful design rule here is simple: reduce decoration until spacing, type, and state can do the work.

## What is working

- [x] The main action remains obvious without becoming loud.
- [x] Secondary controls are discoverable on hover.
- [x] Content width stays readable on a wide screen.
- [ ] The smallest metadata could use a little more contrast.

| Area | Observation | Recommendation |
| --- | --- | --- |
| Layout | Strong left-to-right scan path | Keep the reading column under `76ch` |
| Color | Accent is used sparingly | Reserve it for links, citations, and active controls |
| Density | Comfortable overall | Tighten only repeated rows, not prose |
| Motion | State changes feel calm | Use short, continuous streaming updates |

The spacing also follows a useful rhythm. If the base unit is $s = 4\text{px}$, most gaps can be described by

$$
S_n = n \cdot s, \qquad n \in \{1, 2, 3, 4, 6, 8\}.
$$

That small scale is enough to create consistency without making the page feel mechanically uniform.

## A lightweight React shape

<squigitcode language="typescript">
type StreamState = {
  content: string;
  final: boolean;
};

export function appendChunk(
  state: StreamState,
  chunk: string,
): StreamState {
  return {
    content: state.content + chunk,
    final: false,
  };
}
</squigitcode>

The renderer should receive the entire accumulated string on every update. That lets an unfinished table, formula, or emphasis marker settle naturally as more text arrives.

<squigitcode language="rust">
fn next_chunk(chars: &[char], cursor: usize, size: usize) -> String {
    chars[cursor..(cursor + size).min(chars.len())]
        .iter()
        .collect()
}
</squigitcode>

### Interaction details

1. Keep the assistant surface transparent so it reads as part of the page.
2. Give the user message a contained surface that mirrors the composer.
3. Preserve the scroll position while the reader is reviewing older content.
4. Follow the stream only while the viewport is already near the bottom.

::: tip
For perceived speed, the first meaningful words matter more than making every chunk the same size.
:::

Inline code such as `monaco.editor.colorize()` can stay visually distinct without adding a heavy editor frame. The same idea applies to links: [Markstream React](https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-react) should look interactive before hover.

For the streaming behavior and parser contract, compare the official React playground <squigitcitation url="https://github.com/Simon-He95/markstream-vue/tree/main/playground-react19" body="The official React 19 playground demonstrates incremental content updates, rich Markdown, and live rendering states.">1</squigitcitation> with the package guide <squigitcitation url="https://markstream.simonhe.me/guide/react-quick-start" body="The quick-start documents NodeRenderer, streaming content, final state, and required styles.">2</squigitcitation>.

Finally, the layout should remain comfortable for mixed-direction content too: **واجهة هادئة، واضحة، وسريعة**. The result is a chat that feels native to the screenshot tool instead of looking like a separate web page embedded inside it.
"##,
            weight: 1,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"Here is a lean, production-ready `AGENTS.md` template designed for CLI agents like OpenAI Codex and Claude Code.

While Codex natively reads `AGENTS.md`, Claude Code natively prioritizes `CLAUDE.md`. The common convention is to keep your root rules in `AGENTS.md` and symlink it so both tools share one source of truth:

<squigitcode language="bash">
ln -s AGENTS.md CLAUDE.md
</squigitcode>

---

### `AGENTS.md` Template

<squigitcode language="markdown">
# AGENTS.md

## Project & Stack
- **Summary**: One-line description of the project and primary goal.
- **Stack**: Language + Version, Framework, Database/ORM, Package Manager.

---

## Exact Commands

Never guess scripts or flags. Use these verified commands:

- **Install**: `pnpm install --frozen-lockfile`
- **Lint & Fix**: `pnpm lint:fix && pnpm format`
- **Type Check**: `pnpm typecheck`
- **Single Test**: `pnpm test -- path/to/test.ts`
- **Build**: `pnpm build`
</squigitcode>

---

### Guardrails & Boundaries

- **Never edit generated files directly**: `schema.prisma`, `*.d.ts`, `dist/`, `migrations/`.
- **Never modify lockfiles manually**: let the package manager handle updates.
- **Never hardcode secrets or credentials**: use `.env.example` as the reference.

### Agent Workflow

When tackling any task:

1. **Inspect First**: read the relevant code and tests before modifying anything.
2. **Minimal Edit**: apply the smallest complete change that solves the issue.
3. **Verify Locally**: run the targeted test, then typecheck and lint.

```bash
cargo xtask doctor
npm run doctor
```
"##,
            weight: 1,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"You are correct that Thibault Sottiaux ([@thsottiaux](https://x.com/thsottiaux)) is widely recognized for his work and resets at OpenAI.

However, based on the latest information, **Dario Amodei** ([@DarioAmodei](https://x.com/DarioAmodei)) is indeed the CEO and a co-founder of Anthropic, making him the most iconic public figure for Anthropic on X. While he has had notable public interactions with Sam Altman, his primary and foundational role is with Anthropic.

Andrej Karpathy ([@karpathy](https://x.com/karpathy)), while a prominent AI researcher, is not considered the main iconic guy for Anthropic in the same way its CEO and co-founder is.

Sources: [crn.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE41eNikawiwmv0XewqyK-HSZ3JDyQfK7H1mjiqV1zQC8dohbXM0vMG6leThYM63sTdlNQtDkeh910IP5X_paaUh6xajDmkLR1FE5rJHirMCf_rOnOHsV_pq2f0iO0GZjEzOHo-K28rFaebvy1vadzE0_XpW8VgkG-7nERJANZpF888DPDYHPkonXZskUDUArZKEYfWhHmeffusk1dWk39mzw==), [gizmodo.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE6JpXXRtsuZWRB-tIoHHO6qyZj00r9ioEpz05Up9jmA2cyR-Pdwg01mYkc9AgUrmv-By_FG_6t2ad3TdYZCHcwBgCkUnzsEtdbN0IF-bHZLd-gwLAOS7-vrj32jKtgEcf_8xqV5sZ5rTeBcqe5qIFGPKQIIHNOrjPICbQba6c_XOvP3qvkvgjYg1nKJRsuhilqksD0jo0yaer4__WdUi9ZP-sqQGINjnr7T1TY2i63X88=), [time.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEIsjhyNtsjKcduYDYS01xErwHN5CLeL7QwIDZiKHZSI_YHFRznM99JBHtiLdH9yJvtB8EK6mOcN9kV7EOGl3I1wSIhKQZI-usDAyJnGy22F0Yx0cSgw_OLKe5PLrcfYVjw1VVZzza9nFvmz_Z2gWUa8QA=)
"##,
            weight: 1,
            web: true,
            error: None,
        },
        SimulatedResponse {
            content: r##"Based on the provided document, **Cursor Origin** is described as an upcoming, AI-native Git hosting platform and code forge from the creators of the Cursor Editor.

Key details from the document:

- **Purpose:** built specifically to handle high-throughput, automated workloads and parallel commits generated by AI agents, rather than traditional human-oriented workflows.
- **Integrations:** extensible via APIs and the Model Context Protocol (MCP) to connect editing, code reviews, and repository hosting.
- **Availability:** listed as being in a waitlist-only preview, with general availability targeted for Fall 2026 following an announcement in June 2026.

Note: live web search is currently unavailable, so these details could not be independently verified beyond the provided document.
"##,
            weight: 1,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"Solving $x^2 - 5x + 6 = 0$ by factoring.

We need two numbers that multiply to $6$ and add to $-5$: those are $-2$ and $-3$.

$$
x^2 - 5x + 6 = (x - 2)(x - 3) = 0
$$

So $x = 2$ or $x = 3$.

Quick check:

- For $x = 2$: $4 - 10 + 6 = 0$.
- For $x = 3$: $9 - 15 + 6 = 0$.

Both satisfy the equation, so the solution set is $\{2, 3\}$.
"##,
            weight: 1,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"You're absolutely right, and my apologies — I don't know your operating system, so I covered the common cases instead of guessing. Tell me which OS you're on and I'll give you the exact command.
"##,
            weight: 4,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"Yes, you're good to go! codex-cli 0.147.0 is installed and responding properly on your path.
"##,
            weight: 4,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"Understood. I've saved that with the thread, so we'll keep the context next time. What do you want to dig into next?
"##,
            weight: 4,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"Done — noted. Say the word when you want me to take the next step.
"##,
            weight: 4,
            web: false,
            error: None,
        },
        SimulatedResponse {
            content: r##"The model is under high demand right now, so this turn failed before producing a response. Open the message menu and hit Regenerate response to retry.
"##,
            weight: 1,
            web: false,
            error: Some(("high-demand", "Model under high demand")),
        },
    ];

    const CHUNK_SIZES: [usize; 8] = [2, 5, 3, 7, 4, 6, 3, 5];
    const CHUNK_DELAYS_MS: [u64; 8] = [14, 18, 24, 16, 30, 21, 34, 17];

    fn seed_rng() -> u64 {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        nanos ^ (std::process::id() as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9) | 1
    }

    fn next_rand(rng: &mut u64) -> u64 {
        *rng ^= *rng >> 12;
        *rng ^= *rng << 25;
        *rng ^= *rng >> 27;
        rng.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn refill_bag(state: &mut PickerState) {
        let mut bag = Vec::new();
        for (index, response) in RESPONSES.iter().enumerate() {
            for _ in 0..response.weight {
                bag.push(index);
            }
        }
        if state.rng == 0 {
            state.rng = seed_rng();
        }
        for position in (1..bag.len()).rev() {
            let other = (next_rand(&mut state.rng) as usize) % (position + 1);
            bag.swap(position, other);
        }
        if let (Some(&first), Some(&last)) = (bag.first(), state.last.as_ref()) {
            if first == last && bag.len() > 1 {
                if let Some(swap) = bag.iter().position(|candidate| *candidate != last) {
                    bag.swap(0, swap);
                }
            }
        }
        state.bag = bag;
    }

    fn lock_picker() -> std::sync::MutexGuard<'static, PickerState> {
        PICKER
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn web_index() -> Option<usize> {
        RESPONSES.iter().position(|response| response.web)
    }

    fn draw_from_bag(state: &mut PickerState) -> usize {
        loop {
            if state.bag.is_empty() {
                refill_bag(state);
            }
            let index = state
                .bag
                .pop()
                .expect("refilled picker bag must not be empty");
            if Some(index) != state.last {
                state.last = Some(index);
                return index;
            }
            if state
                .bag
                .iter()
                .all(|candidate| Some(*candidate) == state.last)
            {
                return index;
            }
            let slot = (next_rand(&mut state.rng) as usize) % (state.bag.len() + 1);
            state.bag.insert(slot.min(state.bag.len()), index);
        }
    }

    /// A picked response body plus its optional machine-readable failure.
    /// Callers persist the error alongside the content so reloads and shared
    /// threads keep the failure visible.
    pub struct SimulatedPick {
        pub content: &'static str,
        pub error_kind: Option<&'static str>,
        pub error_message: Option<&'static str>,
    }

    /// Draw one response. Forced web search always serves the web-grounded
    /// entry; otherwise a weighted shuffle-bag draw that never repeats the
    /// previous turn, exhausts every entry, then refills and loops again.
    pub fn pick_simulated_response(force_web_search: bool) -> SimulatedPick {
        let mut picker = lock_picker();
        if force_web_search {
            if let Some(index) = web_index() {
                picker.bag.retain(|candidate| *candidate != index);
                picker.last = Some(index);
                return pick_at(index);
            }
        }
        pick_at(draw_from_bag(&mut picker))
    }

    fn pick_at(index: usize) -> SimulatedPick {
        let response = &RESPONSES[index];
        SimulatedPick {
            content: response.content,
            error_kind: response.error.map(|entry| entry.0),
            error_message: response.error.map(|entry| entry.1),
        }
    }

    /// Random thinking delay in milliseconds inside the configured range.
    pub fn random_think_ms() -> u64 {
        let mut rng = seed_rng();
        THINK_MIN_MS + next_rand(&mut rng) % (THINK_MAX_MS - THINK_MIN_MS + 1)
    }

    /// Stream one response body in small chunks on a worker thread.
    pub fn stream_simulated_content(
        content: &str,
        on_chunk: impl Fn(String) + Send + 'static,
        on_complete: impl Fn() + Send + 'static,
    ) {
        let content = content.chars().collect::<Vec<_>>();
        thread::spawn(move || {
            let mut cursor = 0;
            let mut turn = 0;
            while cursor < content.len() {
                let end = (cursor + CHUNK_SIZES[turn % CHUNK_SIZES.len()]).min(content.len());
                on_chunk(content[cursor..end].iter().collect::<String>());
                cursor = end;
                thread::sleep(Duration::from_millis(
                    CHUNK_DELAYS_MS[turn % CHUNK_DELAYS_MS.len()],
                ));
                turn += 1;
            }
            on_complete();
        });
    }

    /// Full simulated assistant turn for shells without a TypeScript side:
    /// draw a response, wait a random thinking delay, persist the message.
    pub async fn run_simulated_assistant_turn(conversation_id: &str) -> ThreadResult<String> {
        let pick = pick_simulated_response(false);
        let content = pick.content.to_string();
        tokio::time::sleep(Duration::from_millis(random_think_ms())).await;
        let error = match (pick.error_kind, pick.error_message) {
            (Some(kind), Some(message)) => Some(AssistantError {
                kind: kind.to_string(),
                message: message.to_string(),
            }),
            _ => None,
        };
        super::append_assistant_message(conversation_id, content.clone(), error)?;
        Ok(content)
    }
}

pub mod lens {
    use crate::auth::{get_decrypted_api_key, session_api_keys_active, ApiKeyProvider};
    use crate::storage::{self, OcrAnnotationEntry, ReverseImageSearchCache, ThreadStorage};
    use image::{imageops, GenericImageView};
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

    struct Lcg(u64);

    impl Lcg {
        #[inline]
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            self.0
        }

        #[inline]
        fn range(&mut self, lo: u32, hi: u32) -> u32 {
            if hi <= lo + 1 {
                return lo;
            }
            lo + (self.next() as u32 % (hi - lo))
        }
    }

    pub fn detect_image_tone_from_bytes(bytes: &[u8]) -> Option<String> {
        let img = image::load_from_memory(bytes).ok()?;
        let (width, height) = img.dimensions();

        if width == 0 || height == 0 {
            return Some("dark".to_string());
        }

        let max_dim = 256;
        let thumb = img.thumbnail(max_dim, max_dim);
        let blurred = imageops::blur(&thumb, 1.5);

        let (w, h) = blurred.dimensions();
        if w == 0 || h == 0 {
            return Some("dark".to_string());
        }

        let srgb_to_linear = |c: u8| -> f32 {
            let f = c as f32 / 255.0;
            if f <= 0.04045 {
                f / 12.92
            } else {
                ((f + 0.055) / 1.055).powf(2.4)
            }
        };

        let get_luminance = |r: u8, g: u8, b: u8| -> f32 {
            0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)
        };

        let mut sum_lum = 0.0;
        let mut count = 0;
        for pixel in blurred.pixels() {
            if pixel[3] > 128 {
                sum_lum += get_luminance(pixel[0], pixel[1], pixel[2]);
                count += 1;
            }
        }

        if count == 0 {
            return Some("light".to_string());
        }

        let global_mean = sum_lum / count as f32;
        if global_mean <= 0.05 {
            return Some("dark".to_string());
        }
        if global_mean >= 0.75 {
            return Some("light".to_string());
        }

        let mut rng = Lcg(0xDEAD_BEEF_CAFE_1337);
        let grid_size = 12;
        let spc = 8;

        let thresh = 0.179;
        let mut dark_score = 0.0;
        let mut light_score = 0.0;

        for gy in 0..grid_size {
            for gx in 0..grid_size {
                let cx0 = gx * w / grid_size;
                let cx1 = ((gx + 1) * w / grid_size).max(cx0 + 1);
                let cy0 = gy * h / grid_size;
                let cy1 = ((gy + 1) * h / grid_size).max(cy0 + 1);

                for _ in 0..spc {
                    let x = rng.range(cx0, cx1).min(w.saturating_sub(1));
                    let y = rng.range(cy0, cy1).min(h.saturating_sub(1));

                    if blurred.get_pixel(x, y)[3] < 128 {
                        continue;
                    }

                    let mut local_dark = 0;
                    let mut local_light = 0;
                    let mut valid_neighbors = 0;

                    for dy in -1..=1 {
                        for dx in -1..=1 {
                            let nx = (x as i32 + dx) as u32;
                            let ny = (y as i32 + dy) as u32;
                            if nx < w && ny < h {
                                let px = blurred.get_pixel(nx, ny);
                                if px[3] > 128 {
                                    let l = get_luminance(px[0], px[1], px[2]);
                                    if l < thresh {
                                        local_dark += 1;
                                    } else {
                                        local_light += 1;
                                    }
                                    valid_neighbors += 1;
                                }
                            }
                        }
                    }

                    if valid_neighbors > 0 {
                        let confidence =
                            (local_dark as f32 - local_light as f32).abs() / valid_neighbors as f32;
                        let is_node_dark = local_dark >= local_light;

                        if is_node_dark {
                            dark_score += 1.0 + confidence;
                        } else {
                            light_score += 1.0 + confidence;
                        }
                    }
                }
            }
        }

        if dark_score >= light_score {
            Some("dark".to_string())
        } else {
            Some("light".to_string())
        }
    }

    pub fn detect_image_tone_from_path(path: &Path) -> ThreadResult<Option<String>> {
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        if bytes.is_empty() {
            return Err("Image file is empty".to_string());
        }
        Ok(detect_image_tone_from_bytes(&bytes))
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
            .get_image_path(&thread.metadata.image_hash)
            .map_err(|error| error.to_string())?;
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
            .get_image_path(&thread.metadata.image_hash)
            .map_err(|error| error.to_string())?;
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
