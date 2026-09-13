// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Native terminal-facing workflows built from the same services as the GUI.

use crate::brain::{
    AttachmentPreparationStatus, PrepareAttachmentRequest, PrepareSubmissionAttachmentsRequest,
};
use crate::storage::{
    AttachmentFileType, OcrAnnotationEntry, OcrRegion, Profile, ProfileStore, GOOGLE_ISSUER,
};
use crate::{explorer, profile, services, settings};
use chrono::{SecondsFormat, Utc};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static CLI_OPERATION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub const SUPPORTED_FILE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "pdf", "docx", "xlsx", "pptx", "txt", "md",
    "csv", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "html", "css", "js", "ts",
    "jsx", "tsx", "sh", "bash", "zsh", "fish", "py", "rs", "go", "java", "c", "cpp", "h", "hpp",
    "sql", "log",
];

const CONTRIBUTOR_EMAIL: &str = "contributor@squigit.app";
const CONTRIBUTOR_SUBJECT: &str = "squigit-cli-contributor";

/// Configure an isolated contributor session without persisting API keys.
///
/// When at least one key is present, the deterministic contributor profile is
/// created and activated. With no keys, the profile store enters guest mode so
/// local and OCR-only workflows remain available.
pub fn initialize_contributor_mode(
    gemini_api_key: Option<&str>,
    imgbb_api_key: Option<&str>,
) -> Result<bool, String> {
    let gemini_api_key = nonempty_secret(gemini_api_key);
    let imgbb_api_key = nonempty_secret(imgbb_api_key);
    crate::auth::set_session_api_keys(gemini_api_key, imgbb_api_key)
        .map_err(|error| error.to_string())?;

    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    if gemini_api_key.is_none() && imgbb_api_key.is_none() {
        store
            .clear_active_profile_id()
            .map_err(|error| error.to_string())?;
        return Ok(false);
    }

    let profile = Profile::new_google(
        GOOGLE_ISSUER,
        CONTRIBUTOR_SUBJECT,
        CONTRIBUTOR_EMAIL,
        "Contributor",
        None,
        None,
    );
    store
        .upsert_profile(&profile)
        .map_err(|error| error.to_string())?;
    store
        .set_active_profile_id(&profile.id)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

fn nonempty_secret(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

#[derive(Clone, Debug)]
pub struct CliThreadEntry {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub kind: CliThreadKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CliThreadKind {
    Image,
    SideChat,
}

#[derive(Clone, Debug)]
pub struct CliResumeSection {
    pub title: String,
    pub threads: Vec<CliThreadEntry>,
}

#[derive(Clone, Debug)]
pub struct CliSubmissionRequest {
    pub message: String,
    pub attachment_paths: Vec<PathBuf>,
    pub thread_id: Option<String>,
    pub model: String,
    pub effort: String,
}

#[derive(Clone, Debug)]
pub struct CliSubmissionResult {
    pub log_path: Option<PathBuf>,
    pub canonical_message: String,
    pub brain_message: String,
    pub attachment_hashes: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct CliComposerMention {
    pub start: usize,
    pub end: usize,
    pub path: PathBuf,
}

#[derive(Clone, Debug)]
pub struct CliComposerResolution {
    pub markdown: String,
    pub attachment_paths: Vec<PathBuf>,
    pub mentions: Vec<CliComposerMention>,
}

#[derive(Clone, Debug)]
pub struct CliOcrRun {
    pub model_id: String,
    pub model_name: String,
    pub scanned_at: String,
    pub text: String,
}

struct PreparedAttachment {
    source_path: PathBuf,
    cas_path: String,
    hash: String,
    file_type: AttachmentFileType,
}

pub fn attachment_mention(path: &Path) -> Result<String, String> {
    let path = std::fs::canonicalize(path)
        .map_err(|error| format!("Could not resolve attachment {}: {error}", path.display()))?;
    let label = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment")
        .replace(['[', ']', '\n', '\r'], " ");
    Ok(format!("[{label}](<file://{}>)", normalized_path(&path)))
}

pub fn resolve_composer_mentions(input: &str, directory: &Path) -> CliComposerResolution {
    let mentions = find_composer_mentions(input, directory);
    let mut markdown = String::with_capacity(input.len());
    let mut cursor = 0;
    let mut attachment_paths = Vec::with_capacity(mentions.len());
    for mention in &mentions {
        markdown.push_str(&input[cursor..mention.start]);
        markdown.push_str(
            &attachment_mention(&mention.path)
                .unwrap_or_else(|_| input[mention.start..mention.end].to_string()),
        );
        cursor = mention.end;
        if !attachment_paths.contains(&mention.path) {
            attachment_paths.push(mention.path.clone());
        }
    }
    markdown.push_str(&input[cursor..]);
    CliComposerResolution {
        markdown,
        attachment_paths,
        mentions,
    }
}

pub fn resume_sections_for_directory(directory: &Path) -> Result<Vec<CliResumeSection>, String> {
    let directory = std::fs::canonicalize(directory).unwrap_or_else(|_| directory.to_path_buf());
    let workspaces = explorer::list_workspaces("updated".to_string(), "updated".to_string())?;
    let mut seen = HashSet::new();
    let mut sections = Vec::new();

    for workspace in workspaces {
        let matches_directory = workspace.directories.iter().any(|candidate| {
            let candidate = PathBuf::from(candidate);
            std::fs::canonicalize(&candidate).unwrap_or(candidate) == directory
        });
        if !matches_directory {
            continue;
        }
        let threads = workspace
            .threads
            .into_iter()
            .filter(|thread| seen.insert(thread.id.clone()))
            .map(|thread| CliThreadEntry {
                id: thread.id,
                title: thread.title,
                updated_at: thread.updated_at,
                kind: CliThreadKind::Image,
            })
            .collect::<Vec<_>>();
        if !threads.is_empty() {
            sections.push(CliResumeSection {
                title: workspace.name,
                threads,
            });
        }
    }

    let recents = explorer::list_unassigned_threads(0, 500, "updated".to_string())?
        .threads
        .into_iter()
        .filter(|thread| seen.insert(thread.id.clone()))
        .map(|thread| CliThreadEntry {
            id: thread.id,
            title: thread.title,
            updated_at: thread.updated_at,
            kind: CliThreadKind::Image,
        })
        .collect::<Vec<_>>();
    if !recents.is_empty() {
        sections.push(CliResumeSection {
            title: "Recents".to_string(),
            threads: recents,
        });
    }

    let sidechats = explorer::list_sidechat_threads()?
        .into_iter()
        .map(|thread| CliThreadEntry {
            id: thread.id,
            title: thread.title,
            updated_at: thread.updated_at,
            kind: CliThreadKind::SideChat,
        })
        .collect::<Vec<_>>();
    if !sidechats.is_empty() {
        sections.push(CliResumeSection {
            title: "Chats".to_string(),
            threads: sidechats,
        });
    }

    Ok(sections)
}

pub async fn submit_message(request: CliSubmissionRequest) -> Result<CliSubmissionResult, String> {
    let settings_snapshot = settings::load_settings()?;
    let contributor_mode = crate::auth::session_api_keys_active();
    let profile_id = settings_snapshot.active_profile_id.ok_or_else(|| {
        if contributor_mode {
            "Gemini is unavailable. Set GEMINI_API_KEY in the shell or repo .env.".to_string()
        } else {
            "Login is required before sending a message. Run /login.".to_string()
        }
    })?;
    if !settings_snapshot.google_ai_studio.configured {
        return Err(if contributor_mode {
            "Gemini is unavailable. Set GEMINI_API_KEY in the shell or repo .env.".to_string()
        } else {
            "API key missing. Run /configure to add a Gemini API key.".to_string()
        });
    }
    if request.message.trim().is_empty() && request.attachment_paths.is_empty() {
        return Err("The composer is empty.".to_string());
    }

    let sequence = CLI_OPERATION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut prepared = Vec::with_capacity(request.attachment_paths.len());
    for (index, source_path) in request.attachment_paths.iter().enumerate() {
        let result = services::brain()
            .prepare_attachment(PrepareAttachmentRequest {
                job_id: format!("cli-prepare-{sequence}-{index}"),
                source_path: source_path.to_string_lossy().into_owned(),
            })
            .await;
        if result.status != AttachmentPreparationStatus::Ready {
            return Err(result
                .error_message
                .unwrap_or_else(|| format!("Could not prepare {}", source_path.display())));
        }
        prepared.push(PreparedAttachment {
            source_path: source_path.clone(),
            cas_path: result
                .cas_path
                .ok_or_else(|| "Attachment preparation returned no CAS path".to_string())?,
            hash: result
                .attachment_hash
                .ok_or_else(|| "Attachment preparation returned no object hash".to_string())?,
            file_type: result
                .file_type
                .ok_or_else(|| "Attachment preparation returned no file type".to_string())?,
        });
    }

    let mut canonical_message = request.message.trim().to_string();
    for attachment in &prepared {
        canonical_message = canonical_message.replace(
            &normalized_path(&attachment.source_path),
            &normalized_path(Path::new(&attachment.cas_path)),
        );
    }

    let attachment_hashes = prepared
        .iter()
        .map(|attachment| attachment.hash.clone())
        .collect::<Vec<_>>();
    let boundary_id = request
        .thread_id
        .clone()
        .unwrap_or_else(|| "cli-session".to_string());
    let user_message_id = format!("message-{sequence}");
    let preflight_id = format!("preflight-{sequence}");
    let preflight = services::brain()
        .prepare_submission_attachments(PrepareSubmissionAttachmentsRequest {
            preflight_id: preflight_id.clone(),
            thread_id: boundary_id.clone(),
            user_message_id: user_message_id.clone(),
            attachment_hashes: attachment_hashes.clone(),
        })
        .await;
    if let Some(failed) = preflight
        .results
        .iter()
        .find(|result| result.status != AttachmentPreparationStatus::Ready)
    {
        return Err(failed
            .error_message
            .clone()
            .unwrap_or_else(|| format!("Attachment {} failed preflight", failed.attachment_hash)));
    }
    if !attachment_hashes.is_empty() && preflight.preflight_token.is_none() {
        return Err("Attachment preflight completed without a token.".to_string());
    }

    let text_paths = prepared
        .iter()
        .filter(|attachment| attachment.file_type == AttachmentFileType::TextLocal)
        .map(|attachment| attachment.cas_path.clone())
        .collect::<Vec<_>>();
    let resolved_text_paths = text_paths
        .iter()
        .map(|path| (path.clone(), path.clone()))
        .collect::<HashMap<_, _>>();
    let harness =
        crate::harness::prepare_text_first_message(crate::harness::PrepareTextFirstMessageInput {
            message_text: canonical_message.clone(),
            text_attachment_paths: text_paths,
            resolved_text_attachment_paths: resolved_text_paths,
        })?;

    let profile = profile::get_profile_snapshot()
        .map_err(|error| error.to_string())?
        .profiles
        .into_iter()
        .find(|profile| profile.id == profile_id);
    let timestamp = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let attachments_json = prepared
        .iter()
        .map(|attachment| {
            json!({
                "name": attachment.source_path.file_name().and_then(|value| value.to_str()),
                "fileType": attachment.file_type,
                "sourcePath": attachment.source_path,
                "casPath": attachment.cas_path,
                "attachmentHash": attachment.hash,
                "status": "ready",
            })
        })
        .collect::<Vec<_>>();
    let harness_json = harness
        .attachments
        .iter()
        .map(|attachment| {
            json!({
                "path": attachment.path,
                "displayName": attachment.display_name,
                "extension": attachment.extension,
                "charCount": attachment.char_count,
                "ok": attachment.ok,
                "errorCode": attachment.error_code,
                "errorMessage": attachment.error_message,
            })
        })
        .collect::<Vec<_>>();
    let envelope = json!({
        "timestamp": timestamp,
        "profile": {
            "id": profile_id,
            "email": profile.as_ref().map(|profile| profile.email.as_str()),
        },
        "destination": {
            "kind": if request.thread_id.is_some() { "thread" } else { "cli-session" },
            "threadId": request.thread_id,
        },
        "ids": {
            "threadId": boundary_id,
            "userMessageId": user_message_id,
            "preflightId": preflight_id,
        },
        "composer": {
            "messageMarkdown": canonical_message,
            "modelId": request.model,
            "effort": request.effort,
            "forceWebSearch": false,
        },
        "brainInput": {
            "userMessage": harness.message_text,
            "attachmentPreflightToken": preflight.preflight_token,
        },
        "attachments": attachments_json,
        "preflightResults": preflight.results,
        "harnessResults": harness_json,
    });
    let log_path = write_boundary_log(&timestamp, &envelope)?;

    Ok(CliSubmissionResult {
        log_path,
        canonical_message,
        brain_message: harness.message_text,
        attachment_hashes,
    })
}

pub fn load_ocr_text(thread_id: &str, model_id: Option<&str>) -> Result<String, String> {
    let runs = list_ocr_runs(thread_id)?;
    Ok(model_id
        .and_then(|model_id| runs.iter().find(|run| run.model_id == model_id))
        .or_else(|| runs.first())
        .map(|run| run.text.clone())
        .unwrap_or_default())
}

pub fn list_ocr_runs(thread_id: &str) -> Result<Vec<CliOcrRun>, String> {
    let snapshot = crate::thread::ocr::load_ocr_thread(thread_id)?;
    let mut runs = snapshot
        .ocr_data
        .into_iter()
        .filter_map(|(model_id, entry)| match entry {
            OcrAnnotationEntry::Model(model) => Some(CliOcrRun {
                model_name: squigit_ocr::models::OCR_MODELS
                    .iter()
                    .find(|candidate| candidate.id == model_id)
                    .map(|candidate| candidate.name.to_string())
                    .unwrap_or_else(|| model_id.clone()),
                model_id,
                scanned_at: model
                    .scanned_at
                    .map(|value| value.to_rfc3339())
                    .unwrap_or_else(|| "unknown time".to_string()),
                text: format_ocr_regions(&model.ocr_data),
            }),
            OcrAnnotationEntry::EmptyState(_) => None,
        })
        .collect::<Vec<_>>();
    runs.sort_by(|left, right| right.scanned_at.cmp(&left.scanned_at));
    Ok(runs)
}

pub fn persona_path() -> Result<PathBuf, String> {
    crate::storage::rules::rules_path()
        .ok_or_else(|| "Could not locate Squigit's RULES.md path".to_string())
}

pub fn open_external(value: &str) -> Result<(), String> {
    let parsed = url::Url::parse(value).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err(format!(
            "External URL protocol is not allowed: {}",
            parsed.scheme()
        ));
    }
    webbrowser::open(parsed.as_str()).map_err(|error| error.to_string())
}

fn normalized_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn find_composer_mentions(input: &str, directory: &Path) -> Vec<CliComposerMention> {
    let mut mentions = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = input[cursor..].find('@') {
        let start = cursor + relative_start;
        let starts_at_boundary = start == 0
            || input[..start]
                .chars()
                .next_back()
                .is_some_and(char::is_whitespace);
        if !starts_at_boundary {
            cursor = start + 1;
            continue;
        }

        let tail = &input[start + 1..];
        let (value, end) = if let Some(quoted) = tail.strip_prefix('<') {
            let Some(close) = quoted.find('>') else {
                cursor = start + 1;
                continue;
            };
            (&quoted[..close], start + 1 + close + 2)
        } else {
            let length = tail.find(char::is_whitespace).unwrap_or(tail.len());
            (&tail[..length], start + 1 + length)
        };
        if value.is_empty() {
            cursor = start + 1;
            continue;
        }
        let candidate = Path::new(value);
        let candidate = if candidate.is_absolute() {
            candidate.to_path_buf()
        } else {
            directory.join(candidate)
        };
        let Ok(path) = std::fs::canonicalize(candidate) else {
            cursor = end;
            continue;
        };
        let supported = path.is_file()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    SUPPORTED_FILE_EXTENSIONS
                        .iter()
                        .any(|supported| extension.eq_ignore_ascii_case(supported))
                });
        if supported {
            mentions.push(CliComposerMention { start, end, path });
        }
        cursor = end;
    }
    mentions
}

fn write_boundary_log(
    timestamp: &str,
    envelope: &serde_json::Value,
) -> Result<Option<PathBuf>, String> {
    let Some(logs_dir) = std::env::var_os("SQUIGIT_LOG_DIR").map(PathBuf::from) else {
        return Ok(None);
    };
    std::fs::create_dir_all(&logs_dir).map_err(|error| error.to_string())?;
    let file_name = timestamp
        .chars()
        .map(|character| {
            if character.is_ascii_digit() || matches!(character, 'T' | 'Z' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let path = logs_dir.join(format!("{file_name}.log"));
    let rendered = serde_json::to_string_pretty(envelope).map_err(|error| error.to_string())?;
    std::fs::write(&path, format!("{rendered}\n")).map_err(|error| error.to_string())?;
    Ok(Some(path))
}

fn format_ocr_regions(regions: &[OcrRegion]) -> String {
    #[derive(Clone)]
    struct PositionedRegion {
        text: String,
        x: i32,
        center_y: i32,
        height: i32,
    }

    let mut positioned = regions
        .iter()
        .enumerate()
        .filter_map(|(index, region)| {
            let text = region.text.trim();
            if text.is_empty() {
                return None;
            }
            let points = region
                .bbox
                .iter()
                .filter(|point| point.len() >= 2)
                .collect::<Vec<_>>();
            let (x, center_y, height) = if points.is_empty() {
                (0, i32::MAX / 2 + index as i32, 1)
            } else {
                let min_x = points.iter().map(|point| point[0]).min().unwrap_or(0);
                let min_y = points.iter().map(|point| point[1]).min().unwrap_or(0);
                let max_y = points.iter().map(|point| point[1]).max().unwrap_or(min_y);
                (min_x, min_y + (max_y - min_y) / 2, (max_y - min_y).max(1))
            };
            Some(PositionedRegion {
                text: text.to_string(),
                x,
                center_y,
                height,
            })
        })
        .collect::<Vec<_>>();
    positioned.sort_by_key(|region| (region.center_y, region.x));

    let mut lines: Vec<Vec<PositionedRegion>> = Vec::new();
    for region in positioned {
        let belongs_to_last = lines.last().is_some_and(|line| {
            let center = line.iter().map(|item| item.center_y).sum::<i32>() / line.len() as i32;
            let height = line.iter().map(|item| item.height).max().unwrap_or(1);
            (region.center_y - center).abs() <= height.max(region.height) / 2 + 2
        });
        if belongs_to_last {
            if let Some(line) = lines.last_mut() {
                line.push(region);
            }
        } else {
            lines.push(vec![region]);
        }
    }

    lines
        .into_iter()
        .map(|mut line| {
            line.sort_by_key(|region| region.x);
            line.into_iter()
                .map(|region| region.text)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}
