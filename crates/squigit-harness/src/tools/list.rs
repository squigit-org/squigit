// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::scope::{display_path, is_sensitive_path, ResolvedPath};
use super::{integer_arg, required_string, ToolOutcome, ToolScope};
use ignore::WalkBuilder;
use serde_json::Value;

const DEFAULT_DEPTH: usize = 1;
const MAX_DEPTH: usize = 3;
const MAX_ENTRIES: usize = 200;

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
    let walker = WalkBuilder::new(&directory)
        .max_depth(Some(depth))
        .follow_links(false)
        .require_git(false)
        .sort_by_file_name(|left, right| left.cmp(right))
        .build();

    let mut entries = Vec::new();
    let mut truncated = false;
    for entry in walker.flatten() {
        if entry.depth() == 0 || is_sensitive_path(entry.path(), &directory) {
            continue;
        }
        if entries.len() == MAX_ENTRIES {
            truncated = true;
            break;
        }
        let name = entry.file_name().to_string_lossy();
        let suffix = match entry.file_type() {
            Some(kind) if kind.is_dir() => "/",
            Some(kind) if kind.is_symlink() => "@",
            _ => "",
        };
        entries.push(format!("{}{name}{suffix}", "  ".repeat(entry.depth() - 1)));
    }

    let mut output = format!("Absolute path: {}\n", display_path(&directory));
    if entries.is_empty() {
        output.push_str("(Empty folder)");
    } else {
        output.push_str(&entries.join("\n"));
    }
    if truncated {
        output.push_str(&format!(
            "\n(More than {MAX_ENTRIES} entries found. List a subfolder or use grep_search to narrow down.)"
        ));
    }
    let count = entries.len();
    let noun = if count == 1 { "entry" } else { "entries" };
    Ok(ToolOutcome::success(
        output,
        format!("Listed {count} {noun}"),
    ))
}
