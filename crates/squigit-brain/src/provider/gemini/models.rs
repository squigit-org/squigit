// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub const BOOTSTRAP_LITE_MODEL: &str = "models/gemini-3.5-flash-lite";
pub const PRIMARY_FAST_MODEL: &str = "models/gemini-3.8-flash";
pub const PRIMARY_REASONING_MODEL: &str = "models/gemini-3.1-pro-preview";
pub const DEFAULT_MODEL_EFFORT: &str = "medium";
pub const MODEL_EFFORTS: &[&str] = &["low", "medium", "high"];

#[derive(Clone, Copy, Debug)]
pub struct SelectableModel {
    pub id: &'static str,
    pub name: &'static str,
    pub provider: &'static str,
}

pub const SELECTABLE_MODELS: &[SelectableModel] = &[
    SelectableModel {
        id: PRIMARY_FAST_MODEL,
        name: "Flash",
        provider: "gemini",
    },
    SelectableModel {
        id: PRIMARY_REASONING_MODEL,
        name: "Pro",
        provider: "gemini",
    },
];

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub provider: String,
}

fn is_selectable_chat_model(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    if !lower.starts_with("models/gemini-") {
        return false;
    }
    if !(lower.contains("flash") || lower.contains("pro")) {
        return false;
    }
    for banned in [
        "lite",
        "transcrib",
        "computer",
        "omni",
        "image",
        "embedding",
        "tts",
        "audio",
        "video",
        "music",
    ] {
        if lower.contains(banned) {
            return false;
        }
    }
    true
}

pub async fn list_available_models() -> Result<Vec<AvailableModel>, String> {
    let credential = super::attachments::load_active_credential().await?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|error| error.to_string())?;
    let mut models = Vec::new();
    let mut page_token = String::new();
    loop {
        let mut query = vec![("pageSize", "100")];
        if !page_token.is_empty() {
            query.push(("pageToken", page_token.as_str()));
        }
        let response = client
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", credential.api_key())
            .query(&query)
            .send()
            .await
            .map_err(|error| format!("Could not list Gemini models: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Gemini model listing failed ({})",
                response.status()
            ));
        }
        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|error| format!("Gemini model listing was invalid: {error}"))?;
        models.extend(
            body.get("models")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    let id = item.get("name")?.as_str()?;
                    let supported = item
                        .get("supportedGenerationMethods")
                        .and_then(serde_json::Value::as_array)?;
                    if !supported
                        .iter()
                        .any(|method| method.as_str() == Some("generateContent"))
                        || !is_selectable_chat_model(id)
                    {
                        return None;
                    }
                    Some(AvailableModel {
                        id: id.to_string(),
                        name: item
                            .get("displayName")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(id.trim_start_matches("models/"))
                            .to_string(),
                        provider: "gemini".to_string(),
                    })
                }),
        );
        let Some(next) = body
            .get("nextPageToken")
            .and_then(serde_json::Value::as_str)
            .filter(|token| !token.is_empty())
        else {
            break;
        };
        if next == page_token {
            return Err("Gemini model listing repeated a page token".to_string());
        }
        page_token = next.to_string();
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    models.dedup_by(|left, right| left.id == right.id);
    if models.is_empty() {
        return Err("Gemini returned no usable text generation models".to_string());
    }
    Ok(models)
}

pub fn valid_model_id(model_id: &str) -> bool {
    model_id.starts_with("models/gemini-")
        && model_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'.' | b'_'))
}

pub(crate) fn build_attempt_plan(model_id: &str, effort: &str) -> Result<Vec<String>, String> {
    if !valid_model_id(model_id) {
        return Err("invalid-model-selection: unsupported model ID".to_string());
    }
    if !MODEL_EFFORTS.contains(&effort) {
        return Err("invalid-model-selection: unsupported effort".to_string());
    }

    let fallback: &[&str] = if effort == "high" {
        &[
            PRIMARY_REASONING_MODEL,
            "models/gemini-2.5-pro",
            PRIMARY_FAST_MODEL,
            BOOTSTRAP_LITE_MODEL,
        ]
    } else {
        &[
            PRIMARY_FAST_MODEL,
            "models/gemini-2.5-flash",
            BOOTSTRAP_LITE_MODEL,
            "models/gemini-2.5-flash-lite",
        ]
    };
    let candidates = std::iter::once(model_id)
        .chain(fallback.iter().copied())
        .fold(Vec::<String>::new(), |mut plan, candidate| {
            if !plan.iter().any(|entry| entry == candidate) {
                plan.push(candidate.to_string());
            }
            plan
        });
    Ok(candidates)
}
