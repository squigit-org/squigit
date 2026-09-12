// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus};

const HELP: &str = "Squigit repository tasks

Usage: cargo xtask <COMMAND> [ARGS]

Commands:
  doctor  Validate source hygiene, formatting, and the complete Rust workspace
  dev     Start the Squigit terminal interface; remaining arguments are forwarded

Examples:
  cargo xtask doctor
  SQUIGIT_HOME=~/.squigit-dev cargo xtask dev
  cargo xtask dev -- --home ~/.squigit-dev image.png";

pub fn run(arguments: &[String]) -> i32 {
    let Some(command) = arguments.first().map(String::as_str) else {
        println!("{HELP}");
        return 0;
    };
    let result = match command {
        "doctor" => doctor(),
        "dev" => dev(&arguments[1..]),
        "help" | "-h" | "--help" => {
            println!("{HELP}");
            return 0;
        }
        other => {
            eprintln!("xtask: unknown command {other}\n\n{HELP}");
            return 2;
        }
    };
    match result {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => {
            eprintln!("xtask: {error}");
            1
        }
    }
}

fn doctor() -> Result<ExitStatus, String> {
    let root = workspace_root()?;
    println!("[doctor] source headers and private path references");
    inspect_source_tree(&root)?;

    let checks: &[(&str, &[&str])] = &[
        (
            "workspace metadata",
            &["metadata", "--locked", "--no-deps", "--format-version=1"],
        ),
        ("formatting", &["fmt", "--all", "--", "--check"]),
        (
            "workspace compile",
            &["check", "--locked", "--workspace", "--all-targets"],
        ),
    ];
    for (label, arguments) in checks {
        println!("[doctor] {label}");
        let status = Command::new("cargo")
            .args(*arguments)
            .current_dir(&root)
            .status()
            .map_err(|error| format!("could not start cargo for {label}: {error}"))?;
        if !status.success() {
            return Ok(status);
        }
    }
    println!("[doctor] repository is healthy");
    successful_status()
}

fn dev(arguments: &[String]) -> Result<ExitStatus, String> {
    let root = workspace_root()?;
    let forwarded = arguments
        .strip_prefix(&["--".to_string()])
        .unwrap_or(arguments);
    Command::new("cargo")
        .args(["run", "--package", "squigit-cli", "--bin", "squigit", "--"])
        .args(forwarded)
        .current_dir(root)
        .status()
        .map_err(|error| format!("could not start squigit-cli: {error}"))
}

fn workspace_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "could not locate the workspace root".to_string())
}

fn inspect_source_tree(root: &Path) -> Result<(), String> {
    let roots = [
        root.join("crates"),
        root.join("squigit-cli"),
        root.join("squigit-ocr/runtime"),
        root.join("squigit-rs"),
        root.join("xtask"),
    ];
    let mut problems = Vec::new();
    for source_root in roots {
        visit_files(&source_root, &mut |path| {
            let is_rust = path.extension() == Some(OsStr::new("rs"));
            let is_manifest = path.file_name() == Some(OsStr::new("Cargo.toml"));
            if !is_rust && !is_manifest {
                return;
            }
            let Ok(content) = fs::read_to_string(path) else {
                problems.push(format!("could not read {}", display_path(root, path)));
                return;
            };
            if is_rust
                && !content.starts_with(
                    "// Copyright 2026 a7mddra\n// SPDX-License-Identifier: Apache-2.0\n",
                )
            {
                problems.push(format!(
                    "missing copyright/SPDX header: {}",
                    display_path(root, path)
                ));
            }
            for forbidden in [
                "desktop/.vscode",
                "/home/a7md/@squigit/desktop",
                "../desktop",
            ] {
                if content.contains(forbidden) {
                    problems.push(format!(
                        "private source reference {forbidden:?}: {}",
                        display_path(root, path)
                    ));
                }
            }
        })?;
    }
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems.join("\n"))
    }
}

fn visit_files(root: &Path, callback: &mut impl FnMut(&Path)) -> Result<(), String> {
    let entries = fs::read_dir(root)
        .map_err(|error| format!("could not read {}: {error}", root.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if !matches!(
                path.file_name().and_then(OsStr::to_str),
                Some("target" | ".git")
            ) {
                visit_files(&path, callback)?;
            }
        } else {
            callback(&path);
        }
    }
    Ok(())
}

fn display_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .display()
        .to_string()
}

#[cfg(unix)]
fn successful_status() -> Result<ExitStatus, String> {
    use std::os::unix::process::ExitStatusExt;
    Ok(ExitStatus::from_raw(0))
}

#[cfg(windows)]
fn successful_status() -> Result<ExitStatus, String> {
    use std::os::windows::process::ExitStatusExt;
    Ok(ExitStatus::from_raw(0))
}
