// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::scope::{display_path, is_sensitive_path, ResolvedPath};
use super::{integer_arg, required_string, string_arg, ToolOutcome, ToolScope};
use globset::Glob;
use ignore::WalkBuilder;
use serde_json::Value;
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_DEPTH: usize = 1;
const MAX_DEPTH: usize = 3;
const MAX_ENTRIES: usize = 200;

#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum SortKey {
    Name(String),
    Modified(Reverse<SystemTime>, String),
}

pub(super) fn run(args: &Value, scope: &ToolScope) -> Result<ToolOutcome, String> {
    let directory = match scope.resolve(required_string(args, "dir_path")?)? {
        ResolvedPath::Directory(path) => path,
        ResolvedPath::File(path) => {
            return Err(format!(
                "{} is a file. Use read_file to read it.",
                display_path(&path)
            ))
        }
    };
    let depth = integer_arg(args, "depth")?
        .unwrap_or(DEFAULT_DEPTH)
        .clamp(1, MAX_DEPTH);
    let modified = match string_arg(args, "sort_by").unwrap_or("name") {
        "name" => false,
        "modified" => true,
        _ => return Err("sort_by must be name or modified".to_string()),
    };
    let limit = integer_arg(args, "limit")?
        .unwrap_or(MAX_ENTRIES)
        .clamp(1, MAX_ENTRIES);
    let filter = string_arg(args, "include_pattern")
        .map(|pattern| Glob::new(pattern).map(|glob| glob.compile_matcher()))
        .transpose()
        .map_err(|error| format!("Invalid file pattern: {error}"))?;
    let walker = WalkBuilder::new(&directory)
        .max_depth(Some(depth))
        .follow_links(false)
        .require_git(false)
        .sort_by_file_name(|left, right| left.cmp(right))
        .build();

    let mut entries = BinaryHeap::new();
    let mut truncated = false;
    for entry in walker.flatten() {
        if entry.depth() == 0 || is_sensitive_path(entry.path(), &directory) {
            continue;
        }
        if filter.as_ref().is_some_and(|filter| {
            !filter.is_match(entry.file_name())
                && !filter.is_match(
                    entry
                        .path()
                        .strip_prefix(&directory)
                        .unwrap_or(entry.path()),
                )
        }) {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        let suffix = match entry.file_type() {
            Some(kind) if kind.is_dir() => "/",
            Some(kind) if kind.is_symlink() => "@",
            _ => "",
        };
        let relative = entry
            .path()
            .strip_prefix(&directory)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .to_string();
        let timestamp = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .unwrap_or(UNIX_EPOCH);
        let key = if modified {
            SortKey::Modified(Reverse(timestamp), relative.clone())
        } else {
            SortKey::Name(relative.clone())
        };
        let time = timestamp
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let display = if modified {
            format!("{relative}{suffix} (modified: {time})")
        } else {
            format!("{}{name}{suffix}", "  ".repeat(entry.depth() - 1))
        };
        entries.push((key, display));
        if entries.len() > limit {
            entries.pop();
            truncated = true;
        }
    }
    let entries = entries
        .into_sorted_vec()
        .into_iter()
        .map(|(_, display)| display)
        .collect::<Vec<_>>();

    let mut output = format!("Absolute path: {}\n", display_path(&directory));
    if entries.is_empty() {
        output.push_str("(Empty folder)");
    } else {
        output.push_str(&entries.join("\n"));
    }
    if truncated {
        output.push_str(&format!(
            "\n(More than {limit} entries found. {} List a subfolder or use grep_search to narrow down.)", if modified { "The newest entries are shown." } else { "" }
        ));
    }
    let count = entries.len();
    let noun = if count == 1 { "entry" } else { "entries" };
    Ok(ToolOutcome::success(
        output,
        format!("Listed {count} {noun}"),
    ))
}
