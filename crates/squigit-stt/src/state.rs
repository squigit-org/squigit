// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! The "Single Button" state machine.

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum EngineState {
    #[default]
    Idle,
    Starting,
    Listening,
    Stopping,
    Error(String),
}
