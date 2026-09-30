// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod list;
mod read;
mod scope;
mod search;
mod text;

use serde::Serialize;
use serde_json::{json, Value};

pub use scope::ToolScope;

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
            "description": "Reads a text file the user shared in this conversation: a cited source file, a terminal selection, forwarded messages, a cited thread, or a file inside a cited folder. Returns lines prefixed with `L<number>: `. Read only what you need: pass start_line and end_line for a targeted range, or around_line to get the enclosing function or block around a line from an error or stack trace. Without a range, the first 300 lines are returned. Each call returns at most 1000 lines and 32 KB, and lines longer than 1000 characters are shortened. When more content remains, the footer names the start_line to continue from. Use grep_search first to locate content in large files, and call this tool in parallel to read several files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path of a file the user shared, exactly as it appears in their message, or of a file inside a folder they shared."
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
            "description": "Lists the files and folders inside a folder the user shared, or inside one of its subfolders. Folder names end with `/`. Hidden entries and entries excluded by .gitignore are omitted. Use it to discover file paths before calling read_file or grep_search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dir_path": {
                        "type": "string",
                        "description": "Absolute path of a shared folder or of a folder inside it."
                    },
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
