// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Embedded title prompt loading.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TitleConfig {
    pub generate_title: String,
}

pub fn load_title_prompt() -> Result<String, String> {
    let yaml_content = include_str!("../assets/helpers/thread_title.yml");
    let config: TitleConfig = serde_yaml::from_str(yaml_content)
        .map_err(|e| format!("Failed to parse thread_title.yml: {}", e))?;
    Ok(config.generate_title)
}
