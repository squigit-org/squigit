// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Tauri-specific services — these use AppHandle, window APIs, and event emission.
//! Cannot be shared with Electron; must be reimplemented per host.

pub mod brain;
pub mod capture;
pub mod ocr;
pub mod tray;
pub mod window;
