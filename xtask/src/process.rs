// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

pub fn workspace_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "could not locate the workspace root".to_string())
}

pub fn run(command: &mut Command, description: &str) -> Result<(), String> {
    let status = command
        .status()
        .map_err(|error| format!("could not start {description}: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{description} failed with {status}"))
    }
}

pub fn output(command: &mut Command, description: &str) -> Result<String, String> {
    let output = raw_output(command, description)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("{description} failed with {}", output.status)
        } else {
            format!("{description} failed: {stderr}")
        });
    }
    String::from_utf8(output.stdout)
        .map(|value| value.trim().to_string())
        .map_err(|error| format!("{description} produced non-UTF-8 output: {error}"))
}

pub fn raw_output(command: &mut Command, description: &str) -> Result<Output, String> {
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("could not start {description}: {error}"))
}

pub fn cargo_metadata(root: &Path) -> Result<serde_json::Value, String> {
    let output = output(
        Command::new("cargo")
            .args(["metadata", "--no-deps", "--format-version=1"])
            .current_dir(root),
        "cargo metadata",
    )?;
    serde_json::from_str(&output)
        .map_err(|error| format!("could not parse cargo metadata: {error}"))
}

pub fn target_directory(root: &Path) -> Result<PathBuf, String> {
    let metadata = cargo_metadata(root)?;
    metadata["target_directory"]
        .as_str()
        .map(PathBuf::from)
        .ok_or_else(|| "cargo metadata did not report a target directory".to_string())
}
