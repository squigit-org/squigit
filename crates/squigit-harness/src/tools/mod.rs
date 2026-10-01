// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod list;
mod read;
mod scope;
mod search;
mod text;

use serde::Serialize;
use serde_json::{json, Value};

pub use scope::{cited_paths, ToolScope};

pub const READ_FILE: &str = "read_file";
pub const GREP_SEARCH: &str = "grep_search";
pub const LIST_DIRECTORY: &str = "list_directory";
pub const TOOL_NAMES: [&str; 3] = [READ_FILE, GREP_SEARCH, LIST_DIRECTORY];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ToolOutcome {
    pub ok: bool,
    pub output: String,
    pub summary: String,
}

impl ToolOutcome {
    fn success(output: String, summary: String) -> Self {
        Self {
            ok: true,
            output,
            summary,
        }
    }

    fn failure(message: String) -> Self {
        Self {
            ok: false,
            summary: message.clone(),
            output: message,
        }
    }

    pub fn function_response(&self) -> Value {
        if self.ok {
            json!({ "output": self.output })
        } else {
            json!({ "error": self.output })
        }
    }
}

pub fn function_declarations() -> Value {
    json!([
        {
            "name": READ_FILE,
            "description": "Reads a text file or actual image pixels from a path the user requested in ordinary text or shared in this conversation. Files inside a requested folder are available without attachment or @mention. Image pixels follow the matching tool acknowledgements. Text returns lines prefixed with L<number>: . Use start_line/end_line for a targeted range, or around_line for an enclosing block. Text reads return up to 1000 lines and 32 KB. Use grep_search to locate relevant text. PDF and Office reads are temporarily unavailable.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path of a requested file or an image/text file discovered inside an authorized folder. Use the paths from Local file access or list_directory."
                    },
                    "start_line": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "First line to read, 1-based. Defaults to 1."
                    },
                    "end_line": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Last line to read, 1-based and inclusive. Defaults to start_line + 299."
                    },
                    "around_line": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Return the enclosing function, class, or block that contains this 1-based line instead of a line range. start_line and end_line are ignored when it is set."
                    }
                },
                "required": ["file_path"]
            }
        },
        {
            "name": GREP_SEARCH,
            "description": "Searches the files the user shared, and every file inside the folders they shared, for a regular expression. Returns matching lines grouped by file and prefixed with `L<number>: `; context lines use `L<number>- `. Recently modified files are searched first and .gitignore rules are respected. Use it to locate symbols, error messages, or settings before reading a narrow range with read_file. Returns at most 50 matches unless total_max_matches is raised.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regular expression in Rust regex syntax. Use \\b for whole-word symbol matches, or set fixed_strings to search for literal text."
                    },
                    "path": {
                        "type": "string",
                        "description": "Absolute path of one shared file or folder, or of a folder inside a shared folder, to limit the search to. Omit it to search everything the user shared."
                    },
                    "include_pattern": {
                        "type": "string",
                        "description": "Glob that limits which files are searched, for example \"*.rs\" or \"*.{ts,tsx}\"."
                    },
                    "case_sensitive": {
                        "type": "boolean",
                        "description": "Match letter case exactly. Defaults to false."
                    },
                    "fixed_strings": {
                        "type": "boolean",
                        "description": "Treat pattern as literal text instead of a regular expression. Defaults to false."
                    },
                    "context": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 10,
                        "description": "Lines of context to show before and after each match."
                    },
                    "total_max_matches": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 200,
                        "description": "Maximum number of matching lines to return. Defaults to 50."
                    }
                },
                "required": ["pattern"]
            }
        },
        {
            "name": LIST_DIRECTORY,
            "description": "Lists a folder requested in ordinary text or shared in this conversation, including its subfolders. Use the authorized absolute paths in Local file access. Hidden entries and .gitignore exclusions are omitted. To find the newest/last image, set sort_by to modified, include_pattern to an image glob, and limit to 1; then call read_file on the returned image path. Modified timestamps are Unix seconds and entries are newest first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dir_path": {
                        "type": "string",
                        "description": "Absolute path of an authorized folder or one of its subfolders."
                    },
                    "sort_by": { "type":"string", "enum":["name","modified"], "description":"Sort by name or modification time, newest first." },
                    "include_pattern": { "type":"string", "description":"Optional file glob, such as *.{png,jpg,jpeg,webp,gif,bmp,avif,svg}." },
                    "limit": { "type":"integer", "minimum":1, "maximum":200, "description":"Maximum entries to return. Defaults to 200." },
                    "depth": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 3,
                        "description": "How many levels to descend. Defaults to 1."
                    }
                },
                "required": ["dir_path"]
            }
        }
    ])
}

pub fn execute(name: &str, args: &Value, scope: &ToolScope) -> ToolOutcome {
    let result = match name {
        READ_FILE => read::run(args, scope),
        GREP_SEARCH => search::run(args, scope),
        LIST_DIRECTORY => list::run(args, scope),
        _ => Err(format!("Unknown tool: {name}")),
    };
    result.unwrap_or_else(ToolOutcome::failure)
}

fn string_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn required_string<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    string_arg(args, key).ok_or_else(|| format!("The '{key}' parameter is required."))
}

fn integer_arg(args: &Value, key: &str) -> Result<Option<usize>, String> {
    let Some(value) = args.get(key).filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let number = value
        .as_u64()
        .or_else(|| {
            value
                .as_f64()
                .filter(|number| number.fract() == 0.0 && *number >= 0.0)
                .map(|number| number as u64)
        })
        .or_else(|| value.as_str().and_then(|text| text.trim().parse().ok()))
        .ok_or_else(|| format!("The '{key}' parameter must be a non-negative integer."))?;
    Ok(Some(usize::try_from(number).unwrap_or(usize::MAX)))
}

fn line_arg(args: &Value, key: &str) -> Result<Option<usize>, String> {
    match integer_arg(args, key)? {
        Some(0) => Err(format!(
            "The '{key}' parameter is 1-based and must be at least 1."
        )),
        value => Ok(value),
    }
}

fn bool_arg(args: &Value, key: &str) -> Result<Option<bool>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(value)) => Ok(Some(*value)),
        Some(Value::String(text)) if text.eq_ignore_ascii_case("true") => Ok(Some(true)),
        Some(Value::String(text)) if text.eq_ignore_ascii_case("false") => Ok(Some(false)),
        Some(_) => Err(format!("The '{key}' parameter must be true or false.")),
    }
}
