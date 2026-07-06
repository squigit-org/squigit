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
            if path.exists() {
                if let Ok(contents) = fs::read_to_string(&path) {
                    if let Ok(config) = serde_json::from_str::<Config>(&contents) {
                        return config;
                    }
                }
            } else {
                let config = Self::migrate();
                let _ = config.save();
                return config;
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

    fn migrate() -> Self {
        let mut config = Config::default();
        if let Some(base_dir) = base_config_dir() {
            let legacy_json_path = base_dir.join("squigit.json");
            let legacy_soul_path = base_dir.join("soul.md");

            let mut migrated_something = false;

            if legacy_json_path.exists() {
                if let Ok(contents) = fs::read_to_string(&legacy_json_path) {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&contents) {
                        if let Some(prompt) = parsed.get("prompt").and_then(|v| v.as_str()) {
                            config.prompt = prompt.to_string();
                            migrated_something = true;
                        }
                        if legacy_soul_path.exists() {
                            if let Ok(soul_md) = fs::read_to_string(&legacy_soul_path) {
                                let name = parsed
                                    .get("soulMdName")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("soul.md")
                                    .to_string();
                                config.soul = Some(Soul {
                                    name,
                                    markdown: soul_md,
                                });
                                migrated_something = true;
                            }
                        }
                    }
                }
            } else if legacy_soul_path.exists() {
                if let Ok(soul_md) = fs::read_to_string(&legacy_soul_path) {
                    config.soul = Some(Soul {
                        name: "soul.md".to_string(),
                        markdown: soul_md,
                    });
                    migrated_something = true;
                }
            }

            if migrated_something {
                if let Ok(_) = config.save() {
                    let _ = fs::remove_file(legacy_soul_path);
                }
            }
        }
        config
    }
}
