// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::args::CleanTarget;
use crate::process;
use std::fs;
use std::path::Path;

pub fn run(target: CleanTarget) -> Result<(), String> {
    let root = process::workspace_root()?;
    match target {
        CleanTarget::Target => clean_target(&root),
        CleanTarget::Paddlex => clean_paddlex(&root),
        CleanTarget::All => {
            clean_paddlex(&root)?;
            clean_target(&root)
        }
    }
}

fn clean_target(root: &Path) -> Result<(), String> {
    let target = process::target_directory(root)?;
    remove_owned_path(root, &target)
}

fn clean_paddlex(root: &Path) -> Result<(), String> {
    let native = root.join("squigit-ocr/native");
    for path in ["venv", "build", "dist", "models"] {
        remove_owned_path(root, &native.join(path))?;
    }

    let binaries = root.join("binaries");
    if binaries.is_dir() {
        for entry in fs::read_dir(&binaries)
            .map_err(|error| format!("could not read {}: {error}", binaries.display()))?
        {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("paddle-ocr-"))
            {
                remove_owned_path(root, &path)?;
            }
        }
    }

    if let Ok(target) = process::target_directory(root) {
        for path in ["ocr-transfer", "ocr-size"] {
            remove_owned_path(root, &target.join(path))?;
        }
    }
    clean_python_cache(root, &native)
}

fn clean_python_cache(root: &Path, directory: &Path) -> Result<(), String> {
    if !directory.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("could not read {}: {error}", directory.display()))?
    {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            if path.file_name().and_then(|name| name.to_str()) == Some("__pycache__") {
                remove_owned_path(root, &path)?;
            } else if !matches!(
                path.file_name().and_then(|name| name.to_str()),
                Some("venv" | "build" | "dist" | "models")
            ) {
                clean_python_cache(root, &path)?;
            }
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| matches!(extension, "pyc" | "pyo"))
        {
            remove_owned_path(root, &path)?;
        }
    }
    Ok(())
}

fn remove_owned_path(root: &Path, path: &Path) -> Result<(), String> {
    if !path.exists() && !path.is_symlink() {
        return Ok(());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("could not canonicalize {}: {error}", root.display()))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("could not canonicalize {}: {error}", path.display()))?;
    if canonical_path == canonical_root || !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "refusing to remove path outside the repository: {}",
            path.display()
        ));
    }
    println!("Removing {}", display_path(root, path));
    if path.is_dir() && !path.is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|error| format!("could not remove {}: {error}", path.display()))
}

fn display_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .display()
        .to_string()
}
