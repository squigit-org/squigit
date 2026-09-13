// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};

#[path = "../../squigit-ocr/build.rs"]
mod ocr_build;

const HELP: &str = "Squigit repository tasks

Usage: cargo xtask <COMMAND> [ARGS]

Commands:
  build   Build one product with --cli or --ocr
  doctor  Validate source hygiene, formatting, and the complete Rust workspace
  dev     Start the Squigit terminal interface; use --demo for contributor mode

Examples:
  cargo xtask build --cli
  cargo xtask build --ocr
  cargo xtask doctor
  cargo xtask dev --demo
  SQUIGIT_HOME=\"$HOME/.squigit-dev\" cargo xtask dev
  cargo xtask dev -- --home \"$HOME/.squigit-dev\" image.png";

pub fn run(arguments: &[String]) -> i32 {
    let Some(command) = arguments.first().map(String::as_str) else {
        println!("{HELP}");
        return 0;
    };
    let result = match command {
        "build" => build(&arguments[1..]),
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

fn build(arguments: &[String]) -> Result<ExitStatus, String> {
    let root = workspace_root()?;
    match arguments {
        [product] if product == "--cli" => Command::new("cargo")
            .args(["build", "--release", "--package", "squigit-cli"])
            .current_dir(root)
            .status()
            .map_err(|error| format!("could not start the Squigit CLI build: {error}")),
        [product] if product == "--ocr" => {
            ocr_build::run(&root, false)?;
            successful_status()
        }
        [] => Err("build requires exactly one product flag: --cli or --ocr".to_string()),
        _ => Err("build accepts exactly one product flag: --cli or --ocr".to_string()),
    }
}

fn doctor() -> Result<ExitStatus, String> {
    let root = workspace_root()?;
    println!("[doctor] source headers and private path references");
    inspect_source_tree(&root)?;

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
        let status = command
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
    let (demo, forwarded) = parse_dev_arguments(arguments);
    let mut command = Command::new("cargo");
    command
        .args(["run", "--package", "squigit-cli", "--bin", "squigit", "--"])
        .args(forwarded)
        .env("SQUIGIT_LOG_DIR", root.join("logs"))
        .current_dir(&root);

    if demo {
        command.env("SQUIGIT_CLI_DEMO", "1");
        if environment_value("SQUIGIT_HOME").is_none()
            && environment_value("SQUIGIT_CONFIG_DIR").is_none()
        {
            command.env("SQUIGIT_CONFIG_DIR", root.join("squigit-demo"));
        }
        for (name, value) in demo_secrets(&root)? {
            command.env(name, value);
        }
    }

    command
        .status()
        .map_err(|error| format!("could not start squigit-cli: {error}"))
}

fn parse_dev_arguments(arguments: &[String]) -> (bool, Vec<String>) {
    let mut demo = false;
    let mut separator_seen = false;
    let mut forwarded = Vec::new();
    for argument in arguments {
        if !separator_seen && argument == "--" {
            separator_seen = true;
        } else if !separator_seen && argument == "--demo" {
            demo = true;
        } else {
            forwarded.push(argument.clone());
        }
    }
    (demo, forwarded)
}

fn demo_secrets(root: &Path) -> Result<Vec<(&'static str, String)>, String> {
    let dotenv = read_dotenv(&root.join(".env"))?;
    let mut values = Vec::new();
    for name in ["GEMINI_API_KEY", "IMGBB_API_KEY"] {
        if let Some(value) = environment_value(name).or_else(|| dotenv.get(name).cloned()) {
            values.push((name, value));
        }
    }
    Ok(values)
}

fn environment_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn read_dotenv(path: &Path) -> Result<HashMap<String, String>, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(format!("could not read {}: {error}", path.display())),
    };
    let mut values = HashMap::new();
    for (index, raw_line) in content.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some((name, value)) = line.split_once('=') else {
            return Err(format!("invalid .env assignment on line {}", index + 1));
        };
        let name = name.trim();
        if !matches!(name, "GEMINI_API_KEY" | "IMGBB_API_KEY") {
            continue;
        }
        let value = unquote_dotenv_value(value.trim());
        if !value.is_empty() {
            values.insert(name.to_string(), value.to_string());
        }
    }
    Ok(values)
}

fn unquote_dotenv_value(value: &str) -> &str {
    if value.len() >= 2 {
        let first = value.as_bytes()[0];
        let last = value.as_bytes()[value.len() - 1];
        if matches!((first, last), (b'\'', b'\'') | (b'"', b'"')) {
            return &value[1..value.len() - 1];
        }
    }
    value
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
    let entries = fs::read_dir(root)
        .map_err(|error| format!("could not read {}: {error}", root.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
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
