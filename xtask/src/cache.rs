// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::process;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn cache_dir(root: &Path) -> PathBuf {
    root.join(".xtask-cache")
}

fn cache_file(root: &Path, name: &str) -> PathBuf {
    cache_dir(root).join(format!("{name}.ok"))
}

fn head_sha(root: &Path) -> Result<String, String> {
    process::output(
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(root),
        "HEAD lookup",
    )
}

fn worktree_clean(root: &Path) -> Result<bool, String> {
    Ok(process::output(
        Command::new("git")
            .args(["status", "--porcelain=v1", "--untracked-files=all"])
            .current_dir(root),
        "git status",
    )?
    .is_empty())
}

/// Returns true when a previous successful `name` validation can be reused:
/// the worktree is clean and the recorded commit still equals `HEAD`.
pub fn should_skip(root: &Path, name: &str) -> Result<bool, String> {
    if !worktree_clean(root)? {
        return Ok(false);
    }
    let sha = head_sha(root)?;
    let cached = match fs::read_to_string(cache_file(root, name)) {
        Ok(cached) => cached,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("could not read validation cache: {error}")),
    };
    Ok(cached.trim() == sha)
}

/// Records a successful `name` validation against the current `HEAD`.
/// Does nothing when the worktree is dirty, so a dirty-tree pass never
/// poisons the cache for its commit.
pub fn mark_ok(root: &Path, name: &str) -> Result<(), String> {
    if !worktree_clean(root)? {
        return Ok(());
    }
    let sha = head_sha(root)?;
    fs::create_dir_all(cache_dir(root))
        .map_err(|error| format!("could not create validation cache: {error}"))?;
    fs::write(cache_file(root, name), format!("{sha}\n"))
        .map_err(|error| format!("could not write validation cache: {error}"))?;
    Ok(())
}
