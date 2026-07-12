// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum SttCommand {
    Start {
        model: Option<String>,
        language: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        device_index: Option<i32>,
    },
    Stop,
    Quit,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SttEvent {
    Error { message: String },
}
