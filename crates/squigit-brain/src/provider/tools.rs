// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::jobs::{now_ms, JobControl};
use serde_json::{json, Value};
use squigit_harness::tools::{ToolScope, TOOL_NAMES};
use squigit_storage::{AttachmentManifest, GroundingImage, GroundingResource, ThreadStorage};
use std::collections::BTreeMap;

pub(crate) struct ConversationTools {
    pub(crate) scope: ToolScope,
    pub(crate) manifest: AttachmentManifest,
    pub(crate) image_sources: BTreeMap<String, String>,
}
pub(crate) fn declarations(scope: &ConversationTools) -> Vec<Value> {
    let mut tools = Vec::new();
    if !scope.scope.is_empty() {
        for declaration in squigit_harness::tools::function_declarations()
            .as_array()
            .into_iter()
            .flatten()
        {
            tools.push(json!({"type":"function", "function":declaration}));
        }
    }
    tools.push(json!({"type":"function", "function":{"name":"recall_attachment", "description":"Read an image shared in this conversation when its brief is insufficient. Select the matching image by its brief, then use its attachment_hash from attachment_manifest.json. This supplies its actual pixels. Use this only for an image listed in the manifest; an empty manifest means no images have been shared.", "parameters":{"type":"object","properties":{"attachment_hash":{"type":"string"}},"required":["attachment_hash"],"additionalProperties":false}}}));
    tools
}
pub(crate) async fn execute(
    job: &JobControl,
    tools: &ConversationTools,
    call: &Value,
    args: &Value,
) -> (Value, Vec<Value>) {
    let started = now_ms();
    let name = call
        .pointer("/function/name")
        .and_then(Value::as_str)
        .unwrap_or("");
    let mut display_name = None;
    let mut resource = None;
    let mut images = Vec::new();
    let result: Result<String, String> = async {
        if name == "recall_attachment" {
            let hash = args["attachment_hash"]
                .as_str()
                .ok_or("Missing attachment ID")?;
            let entry = tools
                .manifest
                .iter()
                .find(|entry| entry.attachment_hash == hash)
                .ok_or("Attachment was not shared in this conversation")?;
            display_name = Some(entry.display_name.clone());
            job.phase("recalling", display_name.clone());
            let image = super::images::from_hash(hash).await?;
            let image_path = ThreadStorage::new()
                .and_then(|storage| storage.find_object_blob(hash))
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .to_string();
            resource = Some(GroundingResource {
                path: tools
                    .image_sources
                    .get(hash)
                    .cloned()
                    .unwrap_or_else(|| image_path.clone()),
                display_name: entry.display_name.clone(),
                is_folder: false,
                image: Some(GroundingImage {
                    path: image_path,
                    attachment_hash: hash.to_string(),
                }),
            });
            images.push(super::transport::text(format!(
                "Recalled image: {} (attachment_id: {hash})",
                entry.display_name
            )));
            images.push(image);
            return Ok(format!(
                "Loaded {}. Its pixels follow the tool acknowledgements.",
                entry.display_name
            ));
        }
        if !TOOL_NAMES.contains(&name) {
            return Err("This tool is unavailable".to_string());
        }
        let path = args["file_path"]
            .as_str()
            .or_else(|| args["dir_path"].as_str())
            .or_else(|| args["path"].as_str())
            .unwrap_or("");
        display_name = std::path::Path::new(path)
            .file_name()
            .map(|name| name.to_string_lossy().to_string());
        job.phase(
            if name == "grep_search" {
                "searching"
            } else {
                "reading"
            },
            display_name.clone(),
        );
        if let Ok(canonical) = tools.scope.resolve_path(path) {
            let resolved = canonical.to_string_lossy().to_string();
            let resolved = resolved
                .strip_prefix(r"\\?\")
                .unwrap_or(&resolved)
                .to_string();
            display_name = Some(
                canonical
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| resolved.clone()),
            );
            resource = Some(GroundingResource {
                path: resolved,
                display_name: display_name.clone().unwrap_or_else(|| path.to_string()),
                is_folder: canonical.is_dir(),
                image: None,
            });
        }
        if super::images::is_disabled_document(path) {
            return Err("PDF and Office reads are temporarily unavailable".to_string());
        }
        if name == "read_file"
            && std::path::Path::new(path)
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    matches!(
                        extension.to_ascii_lowercase().as_str(),
                        "png"
                            | "jpg"
                            | "jpeg"
                            | "webp"
                            | "gif"
                            | "bmp"
                            | "svg"
                            | "avif"
                            | "tif"
                            | "tiff"
                    )
                })
        {
            let canonical = tools.scope.resolve_file(path)?;
            let stored = tokio::task::spawn_blocking(move || {
                let size = std::fs::metadata(&canonical)
                    .map_err(|error| error.to_string())?
                    .len();
                if size > 20 * 1024 * 1024 {
                    return Err("This image is larger than 20 MB".to_string());
                }
                squigit_harness::images::store_image_rendition(
                    &std::fs::read(&canonical).map_err(|error| error.to_string())?,
                )
            })
            .await
            .map_err(|error| error.to_string())??;
            images.push(super::transport::text(format!(
                "Read image: {}",
                display_name.as_deref().unwrap_or("image")
            )));
            images.push(super::images::from_path(&stored.cas_path).await?);
            if let Some(resource) = &mut resource {
                resource.image = Some(GroundingImage {
                    path: stored.cas_path,
                    attachment_hash: stored.hash,
                });
            }
            return Ok(
                "Loaded the requested image. Its pixels follow the tool acknowledgements."
                    .to_string(),
            );
        }
        let scope = tools.scope.clone();
        let name = name.to_string();
        let args = args.clone();
        let outcome = tokio::task::spawn_blocking(move || {
            squigit_harness::tools::execute(&name, &args, &scope)
        })
        .await
        .map_err(|error| error.to_string())?;
        if outcome.ok {
            Ok(outcome.output)
        } else {
            Err(outcome.output)
        }
    }
    .await;
    let ok = result.is_ok();
    job.tool(
        name,
        format!(
            "{} {}",
            if !ok {
                "Couldn't read"
            } else if name == "grep_search" {
                "Searched"
            } else if name == "recall_attachment" {
                "Recalled"
            } else {
                "Read"
            },
            display_name.as_deref().unwrap_or("shared files")
        ),
        started,
        resource,
    );
    let content = match result {
        Ok(output) => json!({"output":output}),
        Err(error) => json!({"error":error}),
    };
    (
        json!({"role":"tool", "tool_call_id":call["id"], "content":content.to_string()}),
        images,
    )
}
