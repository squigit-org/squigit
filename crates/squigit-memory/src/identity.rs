// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;
use std::path::PathBuf;

use crate::paths::base_config_dir;

pub const RULES_FILE_NAME: &str = "RULES.md";

pub fn rules_path() -> Option<PathBuf> {
    base_config_dir().map(|dir| dir.join(RULES_FILE_NAME))
}

pub fn load_rules() -> String {
    rules_path()
        .and_then(|path| fs::read_to_string(path).ok())
        .unwrap_or_default()
}

pub fn save_rules(content: &str) -> Result<(), String> {
    if let Some(path) = rules_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&path, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}
