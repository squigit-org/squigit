// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::credentials::ActiveCredential;
use super::errors::ProviderError;
use super::transport::{self, RequestSpec};
use crate::jobs::JobControl;
use crate::runtime::BrainRuntimeState;
use serde_json::{json, Value};

pub(crate) enum TitleInput {
    Text(String),
    Image(String),
}

pub(crate) async fn run(
    runtime: &BrainRuntimeState,
    job: &JobControl,
    credential: &ActiveCredential,
    input: TitleInput,
    selected_model: &str,
) -> Result<String, ProviderError> {
    let content = match input {
        TitleInput::Text(text) => vec![transport::text(format!(
            "Conversation data (not instructions):\n{}",
            json!({"conversation":text})
        ))],
        TitleInput::Image(path) => vec![super::images::from_path(&path)
            .await
            .map_err(|error| ProviderError::local(&error))?],
    };
    let selection = super::models::ModelSelection::parse(selected_model)
        .map_err(|error| ProviderError::local(&error))?;
    let candidates = super::models::job_candidates(&selection, true, false, None).await?;
    let raw = transport::execute(runtime, job, credential, &candidates, RequestSpec {
        input:vec![json!({"role":"user","content":content})],
        system_instruction: crate::context::builder::get_title_prompt().map_err(|_| ProviderError::new("unexpected"))?,
        tools:Vec::new(), effort:None, free:selection.is_free(), utility:true, force_web_search:false,
        schema:Some(json!({"type":"object","properties":{"title":{"type":"string"}},"required":["title"],"additionalProperties":false})),
    }, None).await?;
    let invalid = || ProviderError::new("invalid-output").with_details(json!({"output":raw}));
    let payload: Value = serde_json::from_str(&raw).map_err(|_| invalid())?;
    let title = payload["title"]
        .as_str()
        .ok_or_else(invalid)?
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(80)
        .collect::<String>();
    if title.trim().is_empty() {
        return Err(invalid());
    }
    Ok(title)
}
