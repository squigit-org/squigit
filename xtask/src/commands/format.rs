// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::process;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;

const PRETTIER_VERSION: &str = "3.6.2";
const RUFF_VERSION: &str = "0.13.1";
const COMMAND_BATCH_SIZE: usize = 100;

pub fn run(all: bool) -> Result<(), String> {
    let root = process::workspace_root()?;
    let files = if all {
        repository_files(&root)?
    } else {
        changed_files(&root)?
    };

    if all {
        println!("[fmt] Rust workspace");
        process::run(
            Command::new("cargo")
                .args(["fmt", "--all"])
                .current_dir(&root),
            "cargo fmt",
        )?;
    } else {
        format_rust(&root, files_with_extensions(&files, &["rs"]))?;
    }

    format_python(&root, files_with_extensions(&files, &["py", "pyi"]))?;
    format_prettier(
        &root,
        files_with_extensions(
            &files,
            &[
                "css", "gql", "graphql", "html", "js", "json", "json5", "jsx", "md", "mdx", "scss",
                "ts", "tsx", "yaml", "yml",
            ],
        ),
    )?;

    println!(
        "[fmt] formatted {} scope",
        if all { "repository" } else { "working-tree" }
    );
    Ok(())
}

fn changed_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = BTreeSet::new();
    collect_git_paths(
        root,
        &["diff", "--name-only", "--diff-filter=ACMR", "-z"],
        &mut files,
    )?;
    collect_git_paths(
        root,
        &[
            "diff",
            "--cached",
            "--name-only",
            "--diff-filter=ACMR",
            "-z",
        ],
        &mut files,
    )?;
    collect_git_paths(
        root,
        &["ls-files", "--others", "--exclude-standard", "-z"],
        &mut files,
    )?;
    existing_repository_files(root, files)
}

fn repository_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = BTreeSet::new();
    collect_git_paths(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
        &mut files,
    )?;
    existing_repository_files(root, files)
}

fn collect_git_paths(
    root: &Path,
    arguments: &[&str],
    files: &mut BTreeSet<PathBuf>,
) -> Result<(), String> {
    let output = process::raw_output(
        Command::new("git").args(arguments).current_dir(root),
        "Git file lookup",
    )?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git file lookup failed with {}", output.status)
        } else {
            format!("Git file lookup failed: {stderr}")
        });
    }
    for path in output.stdout.split(|byte| *byte == 0) {
        if path.is_empty() {
            continue;
        }
        let path = std::str::from_utf8(path)
            .map_err(|error| format!("Git reported a non-UTF-8 path: {error}"))?;
        files.insert(PathBuf::from(path));
    }
    Ok(())
}

fn existing_repository_files(
    root: &Path,
    files: BTreeSet<PathBuf>,
) -> Result<Vec<PathBuf>, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("could not resolve {}: {error}", root.display()))?;
    let mut result = Vec::new();
    for relative in files {
        let path = root.join(&relative);
        if !path.is_file() {
            continue;
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("could not resolve {}: {error}", path.display()))?;
        if !canonical.starts_with(&canonical_root) {
            return Err(format!(
                "refusing to format path outside the repository: {}",
                relative.display()
            ));
        }
        result.push(relative);
    }
    Ok(result)
}

fn files_with_extensions(files: &[PathBuf], extensions: &[&str]) -> Vec<PathBuf> {
    files
        .iter()
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extensions.contains(&extension))
        })
        .cloned()
        .collect()
}

fn format_rust(root: &Path, files: Vec<PathBuf>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    println!("[fmt] Rust changed files ({})", files.len());
    for batch in files.chunks(COMMAND_BATCH_SIZE) {
        let mut command = Command::new("rustfmt");
        command
            .args(["--edition", "2021", "--config", "skip_children=true"])
            .args(batch)
            .current_dir(root);
        process::run(&mut command, "rustfmt")?;
    }
    Ok(())
}

fn format_python(root: &Path, files: Vec<PathBuf>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let ruff = ruff_binary(root)?;
    println!("[fmt] Python files ({})", files.len());
    for batch in files.chunks(COMMAND_BATCH_SIZE) {
        let mut command = Command::new(&ruff);
        command.arg("format").args(batch).current_dir(root);
        process::run(&mut command, "Ruff formatter")?;
    }
    Ok(())
}

fn ruff_binary(root: &Path) -> Result<PathBuf, String> {
    let environment = process::target_directory(root)?
        .join("xtask-tools")
        .join(format!("ruff-{RUFF_VERSION}"));
    let python = if cfg!(windows) {
        environment.join("Scripts/python.exe")
    } else {
        environment.join("bin/python")
    };
    let ruff = if cfg!(windows) {
        environment.join("Scripts/ruff.exe")
    } else {
        environment.join("bin/ruff")
    };
    if ruff.is_file() {
        return Ok(ruff);
    }

    let (host_python, prefix) = find_python(root)?;
    println!("[fmt] installing Ruff {RUFF_VERSION} in the Cargo target directory");
    let mut create = Command::new(&host_python);
    create
        .args(&prefix)
        .args(["-m", "venv"])
        .arg(&environment)
        .current_dir(root);
    process::run(&mut create, "Ruff formatter environment creation")?;

    process::run(
        Command::new(&python)
            .args([
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                &format!("ruff=={RUFF_VERSION}"),
            ])
            .current_dir(root),
        "Ruff formatter installation",
    )?;
    if !ruff.is_file() {
        return Err(format!(
            "Ruff installation did not create {}",
            ruff.display()
        ));
    }
    Ok(ruff)
}

fn find_python(root: &Path) -> Result<(&'static str, Vec<&'static str>), String> {
    let candidates: &[(&str, &[&str])] = if cfg!(windows) {
        &[("py", &["-3"]), ("python", &[]), ("python3", &[])]
    } else {
        &[("python3", &[]), ("python", &[])]
    };
    for (program, prefix) in candidates {
        if Command::new(program)
            .args(*prefix)
            .arg("--version")
            .current_dir(root)
            .output()
            .is_ok_and(|output| output.status.success())
        {
            return Ok((program, prefix.to_vec()));
        }
    }
    Err("Python 3 is required to bootstrap the repository's pinned Ruff formatter".to_string())
}

fn format_prettier(root: &Path, files: Vec<PathBuf>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    println!("[fmt] Prettier files ({})", files.len());
    ensure_command(
        root,
        command_name("npx"),
        "npx is required to run the repository's pinned Prettier formatter",
    )?;

    for batch in files.chunks(COMMAND_BATCH_SIZE) {
        let mut command = Command::new(command_name("npx"));
        command
            .arg("--yes")
            .arg(format!("prettier@{PRETTIER_VERSION}"))
            .args(["--write", "--ignore-unknown", "--"])
            .args(batch)
            .current_dir(root);
        process::run(&mut command, "Prettier formatter")?;
    }
    Ok(())
}

fn ensure_command(root: &Path, command: &str, message: &str) -> Result<(), String> {
    match Command::new(command)
        .arg("--version")
        .current_dir(root)
        .output()
    {
        Ok(output) if output.status.success() => Ok(()),
        _ => Err(message.to_string()),
    }
}

fn command_name(command: &'static str) -> &'static str {
    #[cfg(windows)]
    {
        match command {
            "npx" => "npx.cmd",
            _ => command,
        }
    }
    #[cfg(not(windows))]
    {
        command
    }
}
