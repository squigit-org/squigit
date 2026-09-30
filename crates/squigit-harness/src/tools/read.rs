// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::scope::{display_path, ResolvedPath};
use super::{line_arg, required_string, text, ToolOutcome, ToolScope};
use serde_json::Value;
use std::ops::RangeInclusive;

const DEFAULT_LINES: usize = 300;
const MAX_LINES: usize = 1000;
const MAX_OUTPUT_BYTES: usize = 32 * 1024;
const MAX_LINE_CHARS: usize = 1000;
const MIN_BLOCK_LINES: usize = 20;
const BLOCK_FALLBACK_RADIUS: usize = 40;
const TAB_WIDTH: usize = 4;
const COMMENT_PREFIXES: &[&str] = &["//", "#", "--", "/*", "*", "@", "\"\"\"", ";"];

pub(super) fn run(args: &Value, scope: &ToolScope) -> Result<ToolOutcome, String> {
    let path = match scope.resolve(required_string(args, "file_path")?)? {
        ResolvedPath::File(path) => path,
        ResolvedPath::Directory(path) => {
            return Err(format!(
                "{} is a folder. Use list_directory to see its contents.",
                display_path(&path)
            ))
        }
    };
    let start_line = line_arg(args, "start_line")?;
    let end_line = line_arg(args, "end_line")?;
    let around_line = line_arg(args, "around_line")?;
    let shown_path = display_path(&path);

    let size = std::fs::metadata(&path)
        .map_err(|error| format!("Could not read {shown_path}: {error}"))?
        .len();
    if size > text::MAX_FILE_BYTES {
        return Err(format!(
            "{shown_path} is larger than 20 MB. Use grep_search to find the lines you need."
        ));
    }
    let bytes =
        std::fs::read(&path).map_err(|error| format!("Could not read {shown_path}: {error}"))?;
    let content = text::decode(&path, &bytes)?;
    let lines = content.lines().collect::<Vec<_>>();
    let total = lines.len();
    if total == 0 {
        return Ok(ToolOutcome::success(
            format!("{shown_path}\n(Empty file)"),
            "Read an empty file".to_string(),
        ));
    }

    let range = match around_line {
        Some(anchor) if anchor > total => {
            return Err(format!(
                "around_line {anchor} is beyond the end of the file ({total} lines)."
            ))
        }
        Some(anchor) => {
            let block = enclosing_block(&lines, anchor - 1);
            (block.start() + 1)..=(block.end() + 1)
        }
        None => {
            let first = start_line.unwrap_or(1);
            if first > total {
                return Err(format!(
                    "start_line {first} is beyond the end of the file ({total} lines)."
                ));
            }
            let requested_last = end_line.unwrap_or(first + DEFAULT_LINES - 1);
            if requested_last < first {
                return Err("start_line cannot be greater than end_line.".to_string());
            }
            first..=requested_last.min(first + MAX_LINES - 1).min(total)
        }
    };

    let first = *range.start();
    let mut last = first - 1;
    let mut body = String::new();
    let mut capped = false;
    for number in range {
        let line = format!(
            "L{number}: {}\n",
            text::clip_line(lines[number - 1], MAX_LINE_CHARS)
        );
        if number > first && body.len() + line.len() > MAX_OUTPUT_BYTES {
            capped = true;
            break;
        }
        body.push_str(&line);
        last = number;
    }
    let footer = if capped {
        format!(
            "(Output capped at 32 KB. Showing lines {first}-{last} of {total}. Use start_line={} to continue.)",
            last + 1
        )
    } else if last < total {
        format!(
            "(Showing lines {first}-{last} of {total}. Use start_line={} to continue.)",
            last + 1
        )
    } else {
        format!("(End of file, {total} lines total.)")
    };
    let summary = if first == 1 && last == total {
        format!("Read all {total} lines")
    } else {
        format!("Read lines {first}-{last} of {total}")
    };
    Ok(ToolOutcome::success(
        format!("{shown_path} (lines {first}-{last} of {total})\n{body}{footer}"),
        summary,
    ))
}

fn enclosing_block(lines: &[&str], anchor: usize) -> RangeInclusive<usize> {
    let indents = lines.iter().map(|line| indent_of(line)).collect::<Vec<_>>();
    let Some(mut target) = (anchor..lines.len())
        .chain((0..anchor).rev())
        .find(|&index| indents[index].is_some())
    else {
        return fallback_window(anchor, lines.len());
    };
    if is_closer(lines[target]) {
        if let Some(previous) = previous_content(&indents, target) {
            if indents[previous] > indents[target] {
                target = previous;
            }
        }
    }
    let header = if opens_block(&indents, target) {
        Some(target)
    } else {
        parent(&indents, target)
    };
    let Some(mut header) = header else {
        return fallback_window(anchor, lines.len());
    };
    let mut block = block_range(lines, &indents, header);
    while block.end() - block.start() + 1 < MIN_BLOCK_LINES {
        let Some(outer) = parent(&indents, header) else {
            break;
        };
        let candidate = block_range(lines, &indents, outer);
        if candidate.end() - candidate.start() + 1 > DEFAULT_LINES {
            break;
        }
        header = outer;
        block = candidate;
    }
    if block.start() == block.end() {
        return fallback_window(anchor, lines.len());
    }
    let mut start = *block.start();
    while start > 0
        && indents[start - 1] == indents[header]
        && is_comment_or_attribute(lines[start - 1])
    {
        start -= 1;
    }
    let end = *block.end();
    if end - start + 1 > MAX_LINES {
        let half = MAX_LINES / 2;
        let first = anchor.saturating_sub(half).max(start);
        return first..=(first + MAX_LINES - 1).min(end);
    }
    start..=end
}

fn indent_of(line: &str) -> Option<usize> {
    let mut width = 0;
    for character in line.chars() {
        match character {
            ' ' => width += 1,
            '\t' => width += TAB_WIDTH,
            _ => return Some(width),
        }
    }
    None
}

fn previous_content(indents: &[Option<usize>], index: usize) -> Option<usize> {
    (0..index)
        .rev()
        .find(|&candidate| indents[candidate].is_some())
}

fn next_content(indents: &[Option<usize>], index: usize) -> Option<usize> {
    (index + 1..indents.len()).find(|&candidate| indents[candidate].is_some())
}

fn opens_block(indents: &[Option<usize>], index: usize) -> bool {
    next_content(indents, index).is_some_and(|next| indents[next] > indents[index])
}

fn parent(indents: &[Option<usize>], index: usize) -> Option<usize> {
    let indent = indents[index]?;
    (0..index)
        .rev()
        .find(|&candidate| indents[candidate].is_some_and(|value| value < indent))
}

fn block_range(lines: &[&str], indents: &[Option<usize>], header: usize) -> RangeInclusive<usize> {
    let header_indent = indents[header];
    let mut end = header;
    for index in header + 1..lines.len() {
        let Some(indent) = indents[index] else {
            continue;
        };
        if Some(indent) > header_indent {
            end = index;
            continue;
        }
        if Some(indent) == header_indent && is_closer(lines[index]) {
            end = index;
        }
        break;
    }
    header..=end
}

fn is_closer(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.starts_with(['}', ')', ']'])
        || trimmed.starts_with("</")
        || matches!(
            trimmed.trim_end_matches(';'),
            "end" | "fi" | "done" | "esac"
        )
}

fn is_comment_or_attribute(line: &str) -> bool {
    let trimmed = line.trim_start();
    COMMENT_PREFIXES
        .iter()
        .any(|prefix| trimmed.starts_with(prefix))
}

fn fallback_window(anchor: usize, total: usize) -> RangeInclusive<usize> {
    anchor.saturating_sub(BLOCK_FALLBACK_RADIUS)..=(anchor + BLOCK_FALLBACK_RADIUS).min(total - 1)
}
