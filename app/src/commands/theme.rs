// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::command;
use crate::services::theme;

#[command]
pub fn get_system_theme() -> String {
    theme::get_system_theme()
}
