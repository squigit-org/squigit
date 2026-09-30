// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::scope::{display_path, is_sensitive_path, ResolvedPath};
use super::{bool_arg, integer_arg, required_string, string_arg, text, ToolOutcome, ToolScope};
use globset::{GlobBuilder, GlobMatcher};
use ignore::WalkBuilder;
use regex::RegexBuilder;
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

const DEFAULT_MATCHES: usize = 50;
const MAX_MATCHES: usize = 200;
const MAX_MATCHES_PER_FILE: usize = 20;
const MAX_CONTEXT: usize = 10;
const SINGLE_MATCH_CONTEXT: usize = 20;
const FEW_MATCHES_CONTEXT: usize = 8;
const MAX_CANDIDATE_FILES: usize = 20_000;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_MATCH_CHARS: usize = 500;
const MAX_OUTPUT_BYTES: usize = 32 * 1024;
const SEARCH_DEADLINE: Duration = Duration::from_secs(10);

struct Candidate {
    path: PathBuf,
    root: PathBuf,
    modified: SystemTime,
}

struct FileMatches {
    path: PathBuf,
    lines: Vec<usize>,
}

pub(super) fn run(args: &Value, scope: &ToolScope) -> Result<ToolOutcome, String> {
    let pattern = required_string(args, "pattern")?;
    let case_sensitive = bool_arg(args, "case_sensitive")?.unwrap_or(false);
    let fixed_strings = bool_arg(args, "fixed_strings")?.unwrap_or(false);
    let requested_context = integer_arg(args, "context")?.map(|value| value.min(MAX_CONTEXT));
    let limit = integer_arg(args, "total_max_matches")?
        .unwrap_or(DEFAULT_MATCHES)
        .clamp(1, MAX_MATCHES);
    let include = string_arg(args, "include_pattern");
    let matcher = include
        .map(|glob| {
            GlobBuilder::new(glob)
                .case_insensitive(true)
                .build()
                .map(|glob| glob.compile_matcher())
                .map_err(|error| format!("Invalid include_pattern: {error}"))
        })
        .transpose()?;
    let expression = if fixed_strings {
        regex::escape(pattern)
    } else {
        pattern.to_string()
    };
    let regex = RegexBuilder::new(&expression)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|error| format!("Invalid regular expression: {error}"))?;

    let location = string_arg(args, "path");
    let roots = match location {
        Some(path) => vec![scope.resolve(path)?],
        None => scope.roots(),
    };
    if roots.is_empty() {
        return Err("No files or folders were shared in this conversation.".to_string());
    }
    let scope_label = location
        .map(|path| format!("\"{path}\""))
        .unwrap_or_else(|| "the shared files".to_string());

    let deadline = Instant::now() + SEARCH_DEADLINE;
    let candidates = collect_candidates(&roots, matcher.as_ref());
    let mut results = Vec::<FileMatches>::new();
    let mut total = 0;
    let mut skipped_large = 0;
    let mut timed_out = false;
    for candidate in candidates {
        if Instant::now() > deadline {
            timed_out = true;
            break;
        }
        let Some(content) = searchable_content(&candidate.path, &mut skipped_large) else {
            continue;
        };
        let lines = content
            .lines()
            .enumerate()
            .filter(|(_, line)| regex.is_match(line))
            .map(|(index, _)| index)
            .take(MAX_MATCHES_PER_FILE.min(limit - total))
            .collect::<Vec<_>>();
        if lines.is_empty() {
            continue;
        }
        total += lines.len();
        results.push(FileMatches {
            path: candidate.path,
            lines,
        });
        if total >= limit {
            break;
        }
    }

    if results.is_empty() {
        let mut output = format!("No matches found for pattern \"{pattern}\" in {scope_label}");
        if let Some(glob) = include {
            output.push_str(&format!(" (filter: \"{glob}\")"));
        }
        output.push('.');
        append_notes(&mut output, timed_out, skipped_large);
        return Ok(ToolOutcome::success(
            output,
            format!("No matches for \"{pattern}\""),
        ));
    }

    let context = requested_context.unwrap_or(match total {
        1 => SINGLE_MATCH_CONTEXT,
        2 | 3 => FEW_MATCHES_CONTEXT,
        _ => 0,
    });
    let noun = if total == 1 { "match" } else { "matches" };
    let mut output = format!("Found {total} {noun} for pattern \"{pattern}\" in {scope_label}");
    if let Some(glob) = include {
        output.push_str(&format!(" (filter: \"{glob}\")"));
    }
    output.push_str(":\n---\n");
    let mut capped = false;
    for file in &results {
        let section = render_file(file, context);
        if output.len() + section.len() > MAX_OUTPUT_BYTES {
            capped = true;
            break;
        }
        output.push_str(&section);
        output.push_str("---\n");
    }
    if capped {
        output.push_str("(Output capped at 32 KB. Narrow the pattern, path, or include_pattern to see the remaining matches.)\n");
    }
    if total >= limit {
        output.push_str(&format!(
            "(Stopped after {limit} matches. There may be more; narrow the search or raise total_max_matches.)\n"
        ));
    }
    append_notes(&mut output, timed_out, skipped_large);
    let files = results.len();
    let file_noun = if files == 1 { "file" } else { "files" };
    Ok(ToolOutcome::success(
        output.trim_end().to_string(),
        format!("Found {total} {noun} in {files} {file_noun}"),
    ))
}

fn collect_candidates(roots: &[ResolvedPath], matcher: Option<&GlobMatcher>) -> Vec<Candidate> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for root in roots {
        let (base, is_directory) = match root {
            ResolvedPath::File(path) => (path.clone(), false),
            ResolvedPath::Directory(path) => (path.clone(), true),
        };
        if !is_directory {
            if included(&base, base.parent().unwrap_or(&base), matcher) && seen.insert(base.clone())
            {
                candidates.push(candidate(base.clone(), base));
            }
            continue;
        }
        let walker = WalkBuilder::new(&base)
            .follow_links(false)
            .require_git(false)
            .build();
        for entry in walker.flatten() {
            if candidates.len() >= MAX_CANDIDATE_FILES {
                break;
            }
            if !entry.file_type().is_some_and(|kind| kind.is_file()) {
                continue;
            }
            let path = entry.into_path();
            if is_sensitive_path(&path, &base) || !included(&path, &base, matcher) {
                continue;
            }
            if seen.insert(path.clone()) {
                candidates.push(candidate(path, base.clone()));
            }
        }
    }
    candidates.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then_with(|| left.root.cmp(&right.root))
            .then_with(|| left.path.cmp(&right.path))
    });
    candidates
}

fn candidate(path: PathBuf, root: PathBuf) -> Candidate {
    let modified = std::fs::metadata(&path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    Candidate {
        path,
        root,
        modified,
    }
}

fn included(path: &Path, root: &Path, matcher: Option<&GlobMatcher>) -> bool {
    let Some(matcher) = matcher else {
        return true;
    };
    matcher.is_match(path.strip_prefix(root).unwrap_or(path))
        || path
            .file_name()
            .is_some_and(|name| matcher.is_match(Path::new(name)))
}

fn searchable_content(path: &Path, skipped_large: &mut usize) -> Option<String> {
    let size = std::fs::metadata(path).ok()?.len();
    if size > MAX_SEARCH_FILE_BYTES {
        *skipped_large += 1;
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    text::decode(path, &bytes).ok()
}

fn render_file(file: &FileMatches, context: usize) -> String {
    let mut section = format!("File: {}\n", display_path(&file.path));
    let content = std::fs::read(&file.path)
        .ok()
        .and_then(|bytes| text::decode(&file.path, &bytes).ok())
        .unwrap_or_default();
    let lines = content.lines().collect::<Vec<_>>();
    let matched = file.lines.iter().copied().collect::<HashSet<_>>();
    let mut previous_end: Option<usize> = None;
    for &line in &file.lines {
        let start = line.saturating_sub(context);
        let end = (line + context).min(lines.len().saturating_sub(1));
        let start = match previous_end {
            Some(previous) if start <= previous + 1 => previous + 1,
            Some(_) => {
                section.push_str("--\n");
                start
            }
            None => start,
        };
        for index in start..=end {
            let Some(text_line) = lines.get(index) else {
                break;
            };
            let marker = if matched.contains(&index) { ':' } else { '-' };
            section.push_str(&format!(
                "L{}{marker} {}\n",
                index + 1,
                text::clip_line(text_line, MAX_MATCH_CHARS)
            ));
        }
        previous_end = Some(previous_end.map_or(end, |previous| previous.max(end)));
    }
    section
}

fn append_notes(output: &mut String, timed_out: bool, skipped_large: usize) {
    if timed_out {
        output.push_str("\n(The search stopped after 10 seconds. Narrow the path or include_pattern to search the rest.)");
    }
    if skipped_large > 0 {
        let noun = if skipped_large == 1 { "file" } else { "files" };
        output.push_str(&format!(
            "\n({skipped_large} {noun} larger than 2 MB were skipped.)"
        ));
    }
}
