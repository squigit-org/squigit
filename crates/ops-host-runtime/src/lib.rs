// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Shared desktop runtime logic — pure Rust, no Tauri, no NAPI.
//! Consumed by both Tauri (directly) and Electron (via ffi-napi-bridge).

pub mod audio;
pub mod media;
pub mod platform;
pub mod sidecar;
pub mod security;
