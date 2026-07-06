// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::paths::base_config_dir;

const CONFIG_FILE_NAME: &str = ".squigit-identity.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    #[serde(default = "default_prompt")]
    pub prompt: String,
    pub soul: Option<Soul>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Soul {
    pub name: String,
    pub markdown: String,
}

fn default_prompt() -> String {
    "Analyze this image and explain it or discuss fixes about the issue it describes.".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            prompt: default_prompt(),
            soul: None,
        }
    }
}

impl Config {
    fn config_path() -> Option<PathBuf> {
        base_config_dir().map(|dir| dir.join(CONFIG_FILE_NAME))
    }

    pub fn load() -> Self {
        if let Some(path) = Self::config_path() {
            if !path.exists() {
                let config = Config::default();
                let _ = config.save();
                return config;
            } else if let Ok(contents) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<Config>(&contents) {
                    return config;
                }
            }
        }
        Config::default()
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(path) = Self::config_path() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
            fs::write(&path, json).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
