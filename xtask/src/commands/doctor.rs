// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::{process, workspace};
use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

pub fn run() -> Result<(), String> {
    let root = process::workspace_root()?;
    if crate::cache::should_skip(&root, "doctor")? {
        println!("[doctor] cached: clean tree at HEAD already validated");
        return Ok(());
    }
    println!("[doctor] source headers and private path references");
    inspect_source_tree(&root)?;

    println!("[doctor] package manifests and internal dependencies");
    workspace::validate_manifests(&root)?;

    println!("[doctor] OCR build and workflow versions");
    validate_ocr_layout(&root)?;

    let checks: &[(&str, &[&str], bool)] = &[
        (
            "workspace metadata",
            &["metadata", "--locked", "--no-deps", "--format-version=1"],
            true,
        ),
        ("formatting", &["fmt", "--all", "--", "--check"], false),
        (
            "workspace compile",
            &["check", "--locked", "--workspace"],
            false,
        ),
    ];
    for (label, arguments, quiet) in checks {
        println!("[doctor] {label}");
        let mut command = Command::new("cargo");
        command.args(*arguments).current_dir(&root);
        if *label == "workspace compile" {
            command.env("SQUIGIT_CLI_DEMO", "1");
        }
        if *quiet {
            command.stdout(Stdio::null());
        }
        process::run(&mut command, label)?;
    }
    println!("[doctor] repository is healthy");
    crate::cache::mark_ok(&root, "doctor")?;
    Ok(())
}

fn validate_ocr_layout(root: &Path) -> Result<(), String> {
    let version = fs::read_to_string(root.join("squigit-ocr/native/VERSION"))
        .map_err(|error| format!("could not read native OCR VERSION: {error}"))?;
    let version = workspace::parse_stable_version(version.trim())?;
    let init = fs::read_to_string(root.join("squigit-ocr/native/src/__init__.py"))
        .map_err(|error| format!("could not read native OCR package version: {error}"))?;
    let runtime_assignment = format!("__version__ = \"{version}\"");
    if !init.contains(&runtime_assignment) {
        return Err(format!(
            "native OCR VERSION is {version}, but __init__.py does not contain {runtime_assignment:?}"
        ));
    }
    let workflow = fs::read_to_string(root.join(".github/workflows/ocr-build-matrix.yml"))
        .map_err(|error| format!("could not read OCR build workflow: {error}"))?;
    if !workflow.contains(&format!("default: \"{version}\"")) {
        return Err(format!(
            "OCR build workflow default does not match native version {version}"
        ));
    }
    for required in [
        "squigit-ocr/build.rs",
        "squigit-ocr/native/ocr-engine.spec",
        "squigit-ocr/native/scripts/download_models.py",
        ".github/actions/build-squigit-ocr/action.yml",
    ] {
        if !root.join(required).is_file() {
            return Err(format!("missing OCR build input {required}"));
        }
    }
    Ok(())
}

fn inspect_source_tree(root: &Path) -> Result<(), String> {
    let roots = [
        root.join("crates"),
        root.join("squigit-cli"),
        root.join("squigit-ocr"),
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
            let forbidden_paths = [
                ["desktop", ".vscode"].join("/"),
                ["", "home", "a7md", "@squigit", "desktop"].join("/"),
                ["..", "desktop"].join("/"),
            ];
            for forbidden in forbidden_paths {
                if content.contains(&forbidden) {
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
    for entry in
        fs::read_dir(root).map_err(|error| format!("could not read {}: {error}", root.display()))?
    {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            if !matches!(
                path.file_name().and_then(OsStr::to_str),
                Some("target" | ".git" | "venv" | "build" | "dist" | "models" | "__pycache__")
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
