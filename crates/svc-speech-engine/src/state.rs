// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! The "Single Button" state machine.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineState {
    Idle,
    Starting,
    Listening,
    Stopping,
    Error(String),
}

impl Default for EngineState {
    fn default() -> Self {
        Self::Idle
    }
}
