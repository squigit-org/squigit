// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

#[cfg(target_os = "linux")]
const APP_DIR_NAME: &str = "squigit";

#[cfg(not(target_os = "linux"))]
const APP_DIR_NAME: &str = "Squigit";

pub fn base_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join(APP_DIR_NAME))
}
