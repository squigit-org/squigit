// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::console::Ansi;
use anyhow::{Context, Result};
use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use toml_edit::DocumentMut;
use walkdir::WalkDir;
use xtask::{get_host_target_triple, project_root, tauri_dir, ui_dir, electron_dir};

#[derive(Debug, Clone, Copy, Default)]
pub struct ReportOptions {
    pub strict: bool,
}

#[derive(Debug, Clone)]
struct CheckResult {
    name: String,
    passed: bool,
    details: String,
}

impl CheckResult {
    fn pass(name: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: true,
            details: details.into(),
        }
    }

    fn fail(name: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: false,
            details: details.into(),
        }
    }
}

pub fn run(options: ReportOptions) -> Result<()> {
    let ansi = Ansi::detect();

    println!("\n{}", ansi.bold("Squigit xtask report"));
    println!(
        "  strict mode: {}",
        if options.strict { "on" } else { "off" }
    );

    let mut checks = Vec::new();
    checks.extend(tool_checks());
    checks.push(command_check(
        "cargo check",
        "cargo",
        &["check"],
        &project_root(),
    ));
    checks.push(command_check(
        "renderer typecheck",
        "npx",
        &["tsc", "--noEmit"],
        &ui_dir(),
    ));

    checks.extend(sidecar_checks()?);
    checks.push(version_consistency_check()?);

    println!("\n{}", ansi.bold("Results"));

    let mut failed = 0usize;
    let mut passed = 0usize;

    for check in &checks {
        let status = if check.passed {
            passed += 1;
            ansi.green("PASS")
        } else {
            failed += 1;
            ansi.red("FAIL")
        };

        println!("  [{}] {}", status, check.name);
        if !check.details.trim().is_empty() {
            for line in check.details.lines() {
                println!("       {}", line);
            }
        }
    }

    println!("\n{}", ansi.bold("Summary"));
    println!("  passed: {passed}");
    println!("  failed: {failed}");

    if options.strict && failed > 0 {
        anyhow::bail!("Report failed in strict mode.");
    }

    if failed > 0 {
        println!(
            "{}",
            ansi.yellow("Report completed with warnings (non-strict mode keeps exit code 0).")
        );
    } else {
        println!("{}", ansi.green("Report checks passed."));
    }

    Ok(())
}

fn tool_checks() -> Vec<CheckResult> {
    let mut checks = Vec::new();

    for tool in ["cargo", "rustc", "python3", "npm", "npx", "cmake"] {
        checks.push(tool_check(tool, tool));
    }

    let ui = ui_dir();
    let local_tauri = ui.join("node_modules").join(".bin").join(if cfg!(windows) {
        "tauri.cmd"
    } else {
        "tauri"
    });

    let tauri_from_path = which::which("tauri").is_ok() || which::which("tauri.cmd").is_ok();
    if tauri_from_path || local_tauri.exists() {
        let details = if tauri_from_path {
            "tauri found on PATH".to_string()
        } else {
            format!("tauri found at {}", local_tauri.display())
        };
        checks.push(CheckResult::pass("tool: tauri", details));
    } else {
        checks.push(CheckResult::fail(
            "tool: tauri",
            format!(
                "tauri not found on PATH or local node_modules. Expected local path: {}",
                local_tauri.display()
            ),
        ));
    }

    checks
}

fn tool_check(name: &str, command: &str) -> CheckResult {
    match which::which(command) {
        Ok(path) => CheckResult::pass(format!("tool: {name}"), format!("{}", path.display())),
        Err(_) => CheckResult::fail(format!("tool: {name}"), "not found on PATH"),
    }
}

fn command_check(name: &str, cmd: &str, args: &[&str], cwd: &Path) -> CheckResult {
    let output = Command::new(cmd).args(args).current_dir(cwd).output();

    match output {
        Ok(out) => {
            if out.status.success() {
                CheckResult::pass(name, format!("command succeeded in {}", cwd.display()))
            } else {
                CheckResult::fail(
                    name,
                    format!(
                        "exit code {:?}\n{}",
                        out.status.code(),
                        compact_output(&out.stdout, &out.stderr)
                    ),
                )
            }
        }
        Err(err) => CheckResult::fail(name, format!("failed to execute: {err}")),
    }
}

fn compact_output(stdout: &[u8], stderr: &[u8]) -> String {
    let mut merged = String::new();

    let stdout_text = String::from_utf8_lossy(stdout).trim().to_string();
    if !stdout_text.is_empty() {
        merged.push_str("stdout:\n");
        merged.push_str(&truncate_text(&stdout_text, 12, 1200));
        merged.push('\n');
    }

    let stderr_text = String::from_utf8_lossy(stderr).trim().to_string();
    if !stderr_text.is_empty() {
        merged.push_str("stderr:\n");
        merged.push_str(&truncate_text(&stderr_text, 12, 1200));
    }

    if merged.trim().is_empty() {
        "(no output)".to_string()
    } else {
        merged.trim_end().to_string()
    }
}

fn truncate_text(text: &str, max_lines: usize, max_chars: usize) -> String {
    let mut lines: Vec<&str> = text.lines().collect();
    if lines.len() > max_lines {
        lines.truncate(max_lines);
    }
    let mut out = lines.join("\n");
    if out.len() > max_chars {
        out.truncate(max_chars);
        out.push_str("\n... (truncated)");
    }
    out
}

fn sidecar_checks() -> Result<Vec<CheckResult>> {
    let mut checks = Vec::new();

    let host = get_host_target_triple().context("Failed to resolve host target triple")?;
    let tauri_binaries = tauri_dir().join("binaries");
    let electron_binaries = electron_dir().join("binaries");
    let debug_binaries = project_root().join("target").join("debug").join("binaries");

    let expected = expected_sidecar_artifacts(&host);

    for base in [&tauri_binaries, &electron_binaries, &debug_binaries] {
        for (label, rel_path) in &expected {
            let path = base.join(rel_path);
            let name = format!("artifact: {} ({})", label, base.display());
            if path.exists() {
                let size = path_size_bytes(&path)?;
                checks.push(CheckResult::pass(
                    name,
                    format!("found at {} ({})", path.display(), format_bytes(size)),
                ));
            } else {
                checks.push(CheckResult::fail(
                    name,
                    format!("missing at {}", path.display()),
                ));
            }
        }
    }

    let mut total_tauri_size = 0u64;
    if tauri_binaries.exists() {
        for entry in fs::read_dir(&tauri_binaries)? {
            let entry = entry?;
            total_tauri_size = total_tauri_size.saturating_add(path_size_bytes(&entry.path())?);
        }
    }

    checks.push(CheckResult::pass(
        "binaries total size (archive/desktop/binaries)",
        format_bytes(total_tauri_size),
    ));

    let mut total_electron_size = 0u64;
    if electron_binaries.exists() {
        for entry in fs::read_dir(&electron_binaries)? {
            let entry = entry?;
            total_electron_size = total_electron_size.saturating_add(path_size_bytes(&entry.path())?);
        }
    }

    checks.push(CheckResult::pass(
        "binaries total size (apps/desktop/binaries)",
        format_bytes(total_electron_size),
    ));

    Ok(checks)
}

fn expected_sidecar_artifacts(host: &str) -> Vec<(String, PathBuf)> {
    let whisper_runtime_dir = format!("whisper-stt-{host}");

    vec![
        (
            "OCR runtime".to_string(),
            PathBuf::from(format!("paddle-ocr-{host}")),
        ),
        (
            "Capture runtime".to_string(),
            PathBuf::from(format!("qt-capture-{host}")),
        ),
        (
            "Whisper runtime".to_string(),
            PathBuf::from(whisper_runtime_dir),
        ),
    ]
}

fn version_consistency_check() -> Result<CheckResult> {
    let root = project_root();
    let version_file = root.join("VERSION");

    let root_version = match fs::read_to_string(&version_file) {
        Ok(content) => content.trim().to_string(),
        Err(_) => {
            return Ok(CheckResult::fail(
                "version consistency",
                format!(
                    "VERSION file missing at {}. Use `cargo xtask version --repo` to create/sync it.",
                    version_file.display()
                ),
            ));
        }
    };

    if root_version.is_empty() {
        return Ok(CheckResult::fail(
            "version consistency",
            "VERSION file is empty",
        ));
    }

    let mut mismatches = Vec::new();

    if !is_calver(&root_version) {
        mismatches.push(format!(
            "VERSION should use CalVer YY.MM.DD, got {root_version}"
        ));
    }

    let root_changelog_version = read_first_changelog_version(&root.join("CHANGELOG.md"))?;
    if root_changelog_version.as_deref() != Some(root_version.as_str()) {
        mismatches.push(format!(
            "root repo metadata mismatch: VERSION={} | CHANGELOG={}",
            root_version,
            root_changelog_version.unwrap_or_else(|| "<missing>".to_string())
        ));
    }

    let shell_version = expect_json_version(&root.join("apps").join("desktop").join("package.json"))?;
    if !is_semver(&shell_version) {
        mismatches.push(format!("shell version should use SemVer, got {shell_version}"));
    }
    for (label, value) in [
        (
            "desktop changelog",
            read_first_changelog_version(&root.join("apps").join("desktop").join("CHANGELOG.md"))?
                .unwrap_or_else(|| "<missing>".to_string()),
        ),
        (
            "qt-capture Cargo",
            expect_cargo_package_version(&root.join("sidecars").join("qt-capture").join("Cargo.toml"))?,
        ),
        (
            "qt-capture CMake",
            expect_cmake_version(
                &root
                    .join("sidecars")
                    .join("qt-capture")
                    .join("native")
                    .join("CMakeLists.txt"),
            )?,
        ),
        (
            "napi package",
            expect_json_version(&root.join("crates").join("napi-bridge").join("package.json"))?,
        ),
        (
            "napi Cargo",
            expect_cargo_package_version(&root.join("crates").join("napi-bridge").join("Cargo.toml"))?,
        ),
        (
            "napi index.js",
            expect_napi_index_version(&root.join("crates").join("napi-bridge").join("index.js"))?,
        ),
    ] {
        if value != shell_version {
            mismatches.push(format!("shell mismatch: {label}={value} | expected {shell_version}"));
        }
    }

    let renderer_version =
        expect_json_version(&root.join("apps").join("renderer").join("package.json"))?;
    if !is_calver(&renderer_version) {
        mismatches.push(format!(
            "renderer package version should use CalVer YY.MM.DD, got {renderer_version}"
        ));
    }
    let renderer_changelog =
        read_first_changelog_version(&root.join("apps").join("renderer").join("CHANGELOG.md"))?;
    if renderer_changelog.as_deref() != Some(renderer_version.as_str()) {
        mismatches.push(format!(
            "renderer mismatch: package={} | changelog={}",
            renderer_version,
            renderer_changelog.unwrap_or_else(|| "<missing>".to_string())
        ));
    }

    let ocr_version = expect_python_version(
        &root
            .join("sidecars")
            .join("paddle-ocr")
            .join("src")
            .join("__init__.py"),
    )?;
    let ocr_changelog =
        read_first_changelog_version(&root.join("sidecars").join("paddle-ocr").join("CHANGELOG.md"))?;
    if ocr_changelog.as_deref() != Some(ocr_version.as_str()) {
        mismatches.push(format!(
            "ocr mismatch: package={} | changelog={}",
            ocr_version,
            ocr_changelog.unwrap_or_else(|| "<missing>".to_string())
        ));
    }

    let stt_version =
        expect_cmake_version(&root.join("sidecars").join("whisper-stt").join("CMakeLists.txt"))?;
    let stt_changelog =
        read_first_changelog_version(&root.join("sidecars").join("whisper-stt").join("CHANGELOG.md"))?;
    if stt_changelog.as_deref() != Some(stt_version.as_str()) {
        mismatches.push(format!(
            "stt mismatch: package={} | changelog={}",
            stt_version,
            stt_changelog.unwrap_or_else(|| "<missing>".to_string())
        ));
    }

    if mismatches.is_empty() {
        Ok(CheckResult::pass(
            "version consistency",
            format!(
                "repo={}, shell={}, renderer={}, ocr={}, stt={}",
                root_version, shell_version, renderer_version, ocr_version, stt_version
            ),
        ))
    } else {
        Ok(CheckResult::fail(
            "version consistency",
            mismatches.join("\n"),
        ))
    }
}

fn expect_json_version(path: &Path) -> Result<String> {
    read_json_version(path)?.ok_or_else(|| anyhow::anyhow!("Missing version in {}", path.display()))
}

fn expect_cargo_package_version(path: &Path) -> Result<String> {
    let text = fs::read_to_string(path)
        .with_context(|| format!("Failed to read Cargo file: {}", path.display()))?;
    let doc = text
        .parse::<DocumentMut>()
        .with_context(|| format!("Failed to parse TOML at {}", path.display()))?;

    doc.get("package")
        .and_then(|item| item.as_table_like())
        .and_then(|pkg| pkg.get("version"))
        .and_then(|item| item.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| anyhow::anyhow!("Missing explicit package.version in {}", path.display()))
}

fn read_json_version(path: &Path) -> Result<Option<String>> {
    let text = fs::read_to_string(path)
        .with_context(|| format!("Failed to read JSON version file: {}", path.display()))?;
    let json: Value = serde_json::from_str(&text)
        .with_context(|| format!("Failed to parse JSON file: {}", path.display()))?;

    Ok(json
        .get("version")
        .and_then(|item| item.as_str())
        .map(ToString::to_string))
}

fn expect_cmake_version(path: &Path) -> Result<String> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read CMake file: {}", path.display()))?;

    let re = Regex::new(r"(?i)project\([^\)]*\bVERSION\s+([0-9]+\.[0-9]+\.[0-9]+)")
        .expect("valid regex");

    let version = re
        .captures_iter(&content)
        .find_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| anyhow::anyhow!("Missing project VERSION in {}", path.display()))?;

    Ok(version)
}

fn expect_python_version(path: &Path) -> Result<String> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read Python file: {}", path.display()))?;
    let re = Regex::new(r#"__version__\s*=\s*"([^"]+)""#).expect("valid regex");
    re.captures(&content)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| anyhow::anyhow!("Missing __version__ in {}", path.display()))
}

fn read_first_changelog_version(path: &Path) -> Result<Option<String>> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read changelog: {}", path.display()))?;
    let re = Regex::new(r"(?m)^## \[([0-9]+\.[0-9]+\.[0-9]+|[0-9]{2}\.[0-9]{2}\.[0-9]{2})\]")
        .expect("valid changelog regex");
    let version = re
        .captures_iter(&content)
        .find_map(|caps| caps.get(1).map(|m| m.as_str().to_string()));
    Ok(version)
}

fn expect_napi_index_version(path: &Path) -> Result<String> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read NAPI wrapper: {}", path.display()))?;
    let re = Regex::new(r"bindingPackageVersion !== '([0-9]+\.[0-9]+\.[0-9]+)'")
        .expect("valid napi regex");
    re.captures(&content)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| anyhow::anyhow!("Missing NAPI version guard in {}", path.display()))
}

fn is_semver(version: &str) -> bool {
    Regex::new(r"^[0-9]+\.[0-9]+\.[0-9]+$")
        .expect("valid regex")
        .is_match(version)
}

fn is_calver(version: &str) -> bool {
    Regex::new(r"^[0-9]{2}\.[0-9]{2}\.[0-9]{2}$")
        .expect("valid regex")
        .is_match(version)
}

fn path_size_bytes(path: &Path) -> Result<u64> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("Failed to inspect path: {}", path.display()))?;

    if metadata.is_file() {
        return Ok(metadata.len());
    }

    if metadata.is_dir() {
        let mut total = 0u64;
        for entry in WalkDir::new(path) {
            let entry = entry?;
            if entry.file_type().is_file() {
                total = total.saturating_add(entry.metadata()?.len());
            }
        }
        return Ok(total);
    }

    Ok(0)
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;

    let b = bytes as f64;
    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}
