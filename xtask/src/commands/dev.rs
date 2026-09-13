// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::process;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn run(demo: bool, forwarded: &[String]) -> Result<(), String> {
    let root = process::workspace_root()?;
    let mut command = Command::new("cargo");
    command
        .args(["run", "--package", "squigit-cli", "--bin", "squigit", "--"])
        .args(forwarded)
        .env("SQUIGIT_LOG_DIR", root.join("logs"))
        .current_dir(&root);

    if demo {
        command.env("SQUIGIT_CLI_DEMO", "1");
        if environment_value("SQUIGIT_HOME").is_none()
            && environment_value("SQUIGIT_CONFIG_DIR").is_none()
        {
            command.env("SQUIGIT_CONFIG_DIR", root.join("squigit-demo"));
        }
        for (name, value) in demo_secrets(&root)? {
            command.env(name, value);
        }
    }
    process::run(&mut command, "squigit-cli")
}

fn demo_secrets(root: &Path) -> Result<Vec<(&'static str, String)>, String> {
    let dotenv = read_dotenv(&root.join(".env"))?;
    let mut values = Vec::new();
    for name in ["GEMINI_API_KEY", "IMGBB_API_KEY"] {
        if let Some(value) = environment_value(name).or_else(|| dotenv.get(name).cloned()) {
            values.push((name, value));
        }
    }
    Ok(values)
}

fn environment_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn read_dotenv(path: &Path) -> Result<HashMap<String, String>, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(format!("could not read {}: {error}", path.display())),
    };
    let mut values = HashMap::new();
    for (index, raw_line) in content.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some((name, value)) = line.split_once('=') else {
            return Err(format!("invalid .env assignment on line {}", index + 1));
        };
        let name = name.trim();
        if !matches!(name, "GEMINI_API_KEY" | "IMGBB_API_KEY") {
            continue;
        }
        let value = unquote(value.trim());
        if !value.is_empty() {
            values.insert(name.to_string(), value.to_string());
        }
    }
    Ok(values)
}

fn unquote(value: &str) -> &str {
    if value.len() >= 2 {
        let first = value.as_bytes()[0];
        let last = value.as_bytes()[value.len() - 1];
        if matches!((first, last), (b'\'', b'\'') | (b'"', b'"')) {
            return &value[1..value.len() - 1];
        }
    }
    value
}
