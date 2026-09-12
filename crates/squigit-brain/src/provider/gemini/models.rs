// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub const BOOTSTRAP_LITE_MODEL: &str = "models/gemini-flash-lite-latest";
pub const PRIMARY_FAST_MODEL: &str = "models/gemini-flash-latest";
pub const PRIMARY_REASONING_MODEL: &str = "models/gemini-pro-latest";
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

pub(crate) fn build_attempt_plan(model_id: &str, effort: &str) -> Result<Vec<String>, String> {
    if !matches!(model_id, PRIMARY_FAST_MODEL | PRIMARY_REASONING_MODEL) {
        return Err("invalid-model-selection: unsupported model ID".to_string());
    }
    if !MODEL_EFFORTS.contains(&effort) {
        return Err("invalid-model-selection: unsupported effort".to_string());
    }

    let candidates = if model_id == PRIMARY_FAST_MODEL || effort == "low" {
        vec![BOOTSTRAP_LITE_MODEL.to_string()]
    } else {
        vec![
            PRIMARY_FAST_MODEL.to_string(),
            BOOTSTRAP_LITE_MODEL.to_string(),
        ]
    };
    Ok(candidates)
}
