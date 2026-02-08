// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Zero-latency stdio IPC handler.
//! Defines the protocol and handles serialization/deserialization.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum SttCommand {
    Start {
        model: String,
        language: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        device_index: Option<i32>,
    },
    Stop,
    Quit,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SttEvent {
    Status {
        status: String,
    },
    Transcription {
        text: String,
        is_final: bool,
    },
    Error {
        message: String,
    },
}
