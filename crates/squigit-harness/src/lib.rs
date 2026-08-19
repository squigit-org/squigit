// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use office2pdf::config::{ConvertOptions, Format};
use regex::Regex;
use squigit_storage::{AttachmentFileType, DocumentConversion, ThreadStorage};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static HARNESS_LOG_SEQUENCE: AtomicU64 = AtomicU64::new(1);

const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "csv", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "html", "css",
    "js", "ts", "jsx", "tsx", "sh", "bash", "zsh", "fish", "py", "rs", "go", "java", "c", "cpp",
    "h", "hpp", "sql", "log",
];

const OFFICE_DOCUMENT_EXTENSIONS: &[&str] = &["docx", "xlsx", "pptx"];
const SUPPORTED_DOCUMENT_EXTENSIONS: &[&str] = &["pdf", "docx", "xlsx", "pptx"];
const DOCUMENT_CONVERSION_RECIPE: &str = "office2pdf-0.6.5-default";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrepareDocumentInput {
    pub bytes: Vec<u8>,
    pub extension: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDocument {
    pub pdf_bytes: Vec<u8>,
    pub warning_count: usize,
    pub converted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDocumentObject {
    pub pdf_hash: String,
    pub cas_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrepareTextFirstMessageInput {
    pub message_text: String,
    pub text_attachment_paths: Vec<String>,
    pub resolved_text_attachment_paths: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextAttachmentResult {
    pub path: String,
    pub display_name: String,
    pub extension: String,
    pub char_count: usize,
    pub ok: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextFirstMessage {
    pub message_text: String,
    pub attachments: Vec<TextAttachmentResult>,
    pub consumed_paths: Vec<String>,
}

#[derive(Debug, Clone)]
struct Mention {
    full: String,
    label: String,
    path: String,
}

fn active_storage() -> Result<ThreadStorage, String> {
    ThreadStorage::new().map_err(|error| error.to_string())
}

fn resolve_attachment_path(path: &str) -> Result<PathBuf, String> {
    let storage = active_storage()?;
    let incoming = PathBuf::from(path);
    let hash = if path.len() == 64 && path.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Some(path)
    } else {
        incoming
            .file_stem()
            .and_then(|value| value.to_str())
            .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
    }
    .ok_or_else(|| "Attachment is not a CAS object".to_string())?;
    let canonical = storage
        .find_object_blob(hash)
        .and_then(|path| std::fs::canonicalize(path).map_err(Into::into))
        .map_err(|error| error.to_string())?;
    if !incoming.is_absolute() || path == hash {
        return Ok(canonical);
    }
    let requested = std::fs::canonicalize(incoming).map_err(|error| error.to_string())?;
    if requested == canonical {
        Ok(canonical)
    } else {
        Err("Attachment path is not the canonical CAS object".to_string())
    }
}

fn resolve_text_attachment_path(path: &str) -> Result<PathBuf, String> {
    let resolved = resolve_attachment_path(path)?;
    let storage = active_storage()?;
    let objects_dir = std::fs::canonicalize(storage.objects_dir()).unwrap_or_default();

    if !objects_dir.as_os_str().is_empty() && resolved.starts_with(&objects_dir) {
        return Ok(resolved);
    }

    Err("Attachment path is outside active thread storage scope".to_string())
}

fn unwrap_link_destination(destination: &str) -> String {
    let trimmed = destination.trim();
    let unwrapped = trimmed
        .strip_prefix('<')
        .and_then(|value| value.strip_suffix('>'))
        .map(str::trim)
        .unwrap_or(trimmed);

    if let Some(rest) = unwrapped.strip_prefix("file://") {
        if let Some(path) = rest.strip_prefix('/') {
            if path.as_bytes().get(1) == Some(&b':') {
                return path.to_string();
            }
        }
        return rest.to_string();
    }

    unwrapped.to_string()
}

fn extension(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn normalized_extension(extension: &str) -> String {
    extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
}

pub fn is_office_document_extension(extension: &str) -> bool {
    let extension = normalized_extension(extension);
    OFFICE_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
}

pub fn is_supported_document_extension(extension: &str) -> bool {
    let extension = normalized_extension(extension);
    SUPPORTED_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
}

fn validate_pdf(bytes: &[u8]) -> Result<(), String> {
    if bytes.starts_with(b"%PDF-") {
        Ok(())
    } else {
        Err("Attachment does not contain a valid PDF header".to_string())
    }
}

pub fn prepare_document(input: PrepareDocumentInput) -> Result<PreparedDocument, String> {
    let extension = normalized_extension(&input.extension);
    if extension == "pdf" {
        validate_pdf(&input.bytes)?;
        return Ok(PreparedDocument {
            pdf_bytes: input.bytes,
            warning_count: 0,
            converted: false,
        });
    }

    let format = match extension.as_str() {
        "docx" => Format::Docx,
        "xlsx" => Format::Xlsx,
        "pptx" => Format::Pptx,
        _ => {
            return Err(format!(
                "Unsupported document extension: {}",
                input.extension
            ))
        }
    };
    let converted = office2pdf::convert_bytes(&input.bytes, format, &ConvertOptions::default())
        .map_err(|error| format!("Office conversion failed: {error}"))?;
    validate_pdf(&converted.pdf)?;
    Ok(PreparedDocument {
        pdf_bytes: converted.pdf,
        warning_count: converted.warnings.len(),
        converted: true,
    })
}

pub fn find_prepared_office_document(
    source_hash: &str,
    source_extension: &str,
) -> Result<Option<PreparedDocumentObject>, String> {
    if !is_office_document_extension(source_extension) {
        return Err(format!(
            "Unsupported Office document extension: {source_extension}"
        ));
    }
    let storage = active_storage()?;
    let Some(conversion) = storage
        .load_document_conversion(source_hash, source_extension)
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    if conversion.recipe != DOCUMENT_CONVERSION_RECIPE {
        return Ok(None);
    }
    let pdf_path = match storage.find_object_blob(&conversion.pdf_hash) {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    if pdf_path.extension().and_then(|value| value.to_str()) != Some("pdf") {
        return Ok(None);
    }
    let manifest = match storage.load_object_manifest(&conversion.pdf_hash) {
        Ok(manifest) => manifest,
        Err(_) => return Ok(None),
    };
    if manifest.file_context.file_type != AttachmentFileType::DocumentUpload {
        return Ok(None);
    }
    Ok(Some(PreparedDocumentObject {
        pdf_hash: conversion.pdf_hash,
        cas_path: pdf_path.to_string_lossy().to_string(),
    }))
}

pub fn remember_prepared_office_document(
    source_hash: &str,
    source_extension: &str,
    pdf_hash: &str,
) -> Result<(), String> {
    if !is_office_document_extension(source_extension) {
        return Err(format!(
            "Unsupported Office document extension: {source_extension}"
        ));
    }
    let storage = active_storage()?;
    let pdf_path = storage
        .find_object_blob(pdf_hash)
        .map_err(|error| error.to_string())?;
    if pdf_path.extension().and_then(|value| value.to_str()) != Some("pdf") {
        return Err("Prepared Office document does not point to a PDF object".to_string());
    }
    let manifest = storage
        .load_object_manifest(pdf_hash)
        .map_err(|error| error.to_string())?;
    if manifest.file_context.file_type != AttachmentFileType::DocumentUpload {
        return Err("Prepared Office document is not classified as a document upload".to_string());
    }
    storage
        .save_document_conversion(&DocumentConversion {
            source_hash: source_hash.to_ascii_lowercase(),
            source_extension: normalized_extension(source_extension),
            pdf_hash: pdf_hash.to_ascii_lowercase(),
            recipe: DOCUMENT_CONVERSION_RECIPE.to_string(),
        })
        .map_err(|error| error.to_string())
}

fn is_text_path(path: &str) -> bool {
    TEXT_EXTENSIONS.contains(&extension(path).as_str())
}

fn display_name(label: &str, path: &str) -> String {
    let label = label.trim();
    if !label.is_empty() {
        return label.to_string();
    }

    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment")
        .to_string()
}

fn parse_mentions(message_text: &str) -> Result<Vec<Mention>, String> {
    let re =
        Regex::new(r"\[([^\]\n]+)\]\((<[^>\n]+>|[^)\n]+)\)").map_err(|error| error.to_string())?;
    Ok(re
        .captures_iter(message_text)
        .filter_map(|capture| {
            let full = capture.get(0)?.as_str().to_string();
            let label = capture.get(1)?.as_str().to_string();
            let raw_path = capture.get(2)?.as_str();
            let path = unwrap_link_destination(raw_path);
            Some(Mention { full, label, path })
        })
        .collect())
}

fn read_text_attachment(path: &str, label: &str) -> (TextAttachmentResult, String) {
    let name = display_name(label, path);
    let extension = extension(path);

    let result = match resolve_text_attachment_path(path)
        .and_then(|resolved| std::fs::read(&resolved).map_err(|error| error.to_string()))
    {
        Ok(bytes) => {
            let text = String::from_utf8(bytes)
                .map_err(|error| format!("Attachment is not valid UTF-8: {error}"));
            let text = match text {
                Ok(text) => text,
                Err(message) => {
                    return (
                        TextAttachmentResult {
                            path: path.to_string(),
                            display_name: name.clone(),
                            extension,
                            char_count: 0,
                            ok: false,
                            error_code: Some("read_failed".to_string()),
                            error_message: Some(message.clone()),
                        },
                        format!("[Read failed: {message}]"),
                    );
                }
            };
            let char_count = text.chars().count();
            (
                TextAttachmentResult {
                    path: path.to_string(),
                    display_name: name.clone(),
                    extension,
                    char_count,
                    ok: true,
                    error_code: None,
                    error_message: None,
                },
                text,
            )
        }
        Err(message) => (
            TextAttachmentResult {
                path: path.to_string(),
                display_name: name.clone(),
                extension,
                char_count: 0,
                ok: false,
                error_code: Some("read_failed".to_string()),
                error_message: Some(message.clone()),
            },
            format!("[Read failed: {}]", message),
        ),
    };

    let block = format!(
        "[Attached text file: {}]\n{}\n[/Attached text file]",
        name, result.1
    );
    (result.0, block)
}

fn write_text_first_message_log(ui_message: &str, output: &TextFirstMessage) {
    let Some(logs_dir) = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|repo_root| repo_root.join("logs"))
    else {
        return;
    };

    if let Err(error) = std::fs::create_dir_all(&logs_dir) {
        eprintln!(
            "[SquigitHarness] Failed to create logs directory {}: {}",
            logs_dir.display(),
            error
        );
        return;
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let sequence = HARNESS_LOG_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let path = logs_dir.join(format!(
        "Squigit-Harness-text-first-{}-{:04}.log",
        now_ms, sequence
    ));
    let attachments = output
        .attachments
        .iter()
        .map(|attachment| {
            format!(
                "- path: {}\n  display_name: {}\n  extension: {}\n  char_count: {}\n  ok: {}\n  error_code: {}\n  error_message: {}",
                attachment.path,
                attachment.display_name,
                attachment.extension,
                attachment.char_count,
                attachment.ok,
                attachment.error_code.as_deref().unwrap_or(""),
                attachment.error_message.as_deref().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let rendered = format!(
        "Squigit Harness text-first message log\n\n=== Message leaving UI/Core for harness ===\n{}\n\n=== Harness consumed text attachments ===\n{}\n\n=== Message leaving harness for brain ===\n{}\n",
        ui_message,
        if attachments.is_empty() {
            "(none)"
        } else {
            attachments.as_str()
        },
        output.message_text
    );

    if let Err(error) = std::fs::write(&path, rendered) {
        eprintln!(
            "[SquigitHarness] Failed to write harness log {}: {}",
            path.display(),
            error
        );
    }
}

pub fn prepare_text_first_message(
    input: PrepareTextFirstMessageInput,
) -> Result<TextFirstMessage, String> {
    let ui_message = input.message_text.clone();
    let allowed_paths = input
        .text_attachment_paths
        .iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect::<HashSet<_>>();

    if allowed_paths.is_empty() {
        let output = TextFirstMessage {
            message_text: input.message_text,
            attachments: Vec::new(),
            consumed_paths: Vec::new(),
        };
        write_text_first_message_log(&ui_message, &output);
        return Ok(output);
    }

    let mentions = parse_mentions(&input.message_text)?;
    let mut replacements = HashMap::<String, (TextAttachmentResult, String)>::new();
    let mut attachments = Vec::<TextAttachmentResult>::new();
    let mut consumed_paths = Vec::<String>::new();
    let mut output = input.message_text;

    for mention in mentions {
        if !allowed_paths.contains(&mention.path) || !is_text_path(&mention.path) {
            continue;
        }

        if !replacements.contains_key(&mention.path) {
            let content_path = input
                .resolved_text_attachment_paths
                .get(&mention.path)
                .map(String::as_str)
                .unwrap_or(&mention.path);
            let prepared = read_text_attachment(content_path, &mention.label);
            consumed_paths.push(mention.path.clone());
            attachments.push(prepared.0.clone());
            replacements.insert(mention.path.clone(), prepared);
        }

        if let Some((_, block)) = replacements.get(&mention.path) {
            output = output.replacen(&mention.full, block, 1);
        }
    }

    let output = TextFirstMessage {
        message_text: output,
        attachments,
        consumed_paths,
    };
    write_text_first_message_log(&ui_message, &output);
    Ok(output)
}
