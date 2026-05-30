// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Consolidated Tauri commands organized by domain.
//! Each module is a thin #[tauri::command] wrapper calling desktop-runtime or ops-* crates.

pub mod data;
pub mod media;
pub mod platform;
pub mod ai;
pub mod identity;
