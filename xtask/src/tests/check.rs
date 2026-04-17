// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Result};
use xtask::{project_root, run_cmd};

use super::runner::print_group;

pub fn run(list: bool, category: &str, path: &[String]) -> Result<()> {
    match category {
        "sidecars" => run_sidecars(list, path),
        "apps" => run_apps(list, path),
        "crates" => run_crates(list, path),
        other => bail!("Unknown check category '{}'.", other),
    }
}

#[derive(Debug, Clone)]
struct CheckRunResult {
    scope: String,
    ok: bool,
}

pub fn run_all() -> Result<()> {
    let crate_targets = discover_workspace_crates()?;

    let mut plan: Vec<(String, Vec<String>)> = vec![
        ("apps".to_string(), vec!["desktop".to_string(), "renderer".to_string()]),
        ("apps".to_string(), vec!["desktop".to_string(), "tauri".to_string()]),
        ("apps".to_string(), vec!["cli".to_string()]),
        ("apps".to_string(), vec!["shared".to_string()]),
    ];

    for target in crate_targets {
        plan.push(("crates".to_string(), vec![target.package]));
    }

    plan.extend([
        (
            "sidecars".to_string(),
            vec!["qt-capture".to_string(), "wrapper".to_string()],
        ),
        (
            "sidecars".to_string(),
            vec!["qt-capture".to_string(), "native".to_string()],
        ),
        ("sidecars".to_string(), vec!["paddle-ocr".to_string()]),
        ("sidecars".to_string(), vec!["whisper-stt".to_string()]),
    ]);

    let mut results = Vec::with_capacity(plan.len());

    for (category, path) in plan {
        let scope = format!("{}/{}", category, path.join("/"));
        println!("\n[check:{}]", scope);

        let ok = run(false, &category, &path).is_ok();
        results.push(CheckRunResult { scope, ok });
    }

    print_report(&results);

    if results.iter().any(|result| !result.ok) {
        bail!("One or more checks failed.");
    }

    Ok(())
}

fn run_crates(list: bool, path: &[String]) -> Result<()> {
    let crates = discover_workspace_crates()?;

    if list {
        if !path.is_empty() {
            bail!("`cargo xtask check crates --list` does not accept extra path segments.");
        }

        let entries: Vec<&str> = crates.iter().map(|target| target.alias.as_str()).collect();
        print_group("check/crates", &entries);
        return Ok(());
    }

    if path.len() != 1 {
        bail!("Usage: cargo xtask check crates <crate|all>");
    }

    let root = project_root();
    let token = path[0].as_str();
    if token == "all" {
        let mut args = vec!["check".to_string()];
        for target in &crates {
            args.push("-p".to_string());
            args.push(target.package.clone());
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        return run_cmd("cargo", &arg_refs, &root);
    }

    let target = crates
        .iter()
        .find(|candidate| candidate.alias == token || candidate.package == token)
        .ok_or_else(|| anyhow::anyhow!("Unknown crate '{}'. Run `cargo xtask check crates --list`.", token))?;

    run_cmd("cargo", &["check", "-p", target.package.as_str()], &root)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CrateTarget {
    alias: String,
    package: String,
}

fn discover_workspace_crates() -> Result<Vec<CrateTarget>> {
    let root = project_root().join("crates");
    let mut crates = Vec::new();

    for entry in std::fs::read_dir(&root)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(dir_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        let cargo_toml = path.join("Cargo.toml");
        if !cargo_toml.is_file() {
            continue;
        }

        crates.push(CrateTarget {
            alias: alias_from_dir_name(dir_name),
            package: dir_name.to_string(),
        });
    }

    crates.sort_by(|a, b| a.alias.cmp(&b.alias));
    Ok(crates)
}

fn alias_from_dir_name(dir_name: &str) -> String {
    for prefix in ["ops-", "svc-", "sys-"] {
        if let Some(rest) = dir_name.strip_prefix(prefix) {
            if !rest.is_empty() {
                return rest.to_string();
            }
        }
    }

    dir_name.to_string()
}

fn print_report(results: &[CheckRunResult]) {
    let passed = results.iter().filter(|result| result.ok).count();
    let failed = results.len().saturating_sub(passed);

    println!("\n============================================================");
    println!("CHECK REPORT");
    println!("------------------------------------------------------------");
    for result in results {
        let status = if result.ok { "PASS" } else { "FAIL" };
        println!("[{}] {}", status, result.scope);
    }
    println!("------------------------------------------------------------");
    println!("Passed: {}", passed);
    println!("Failed: {}", failed);
    println!("Total : {}", results.len());
    println!("============================================================");
}

fn run_sidecars(list: bool, path: &[String]) -> Result<()> {
    if list {
        match path {
            [] => {
                print_group("check/sidecars", &["qt-capture", "paddle-ocr", "whisper-stt"]);
                return Ok(());
            }
            [suite] if suite == "qt-capture" => {
                print_group("check/sidecars/qt-capture", &["wrapper", "native"]);
                return Ok(());
            }
            [suite] if suite == "paddle-ocr" => {
                print_group("check/sidecars/paddle-ocr", &["python"]);
                return Ok(());
            }
            [suite] if suite == "whisper-stt" => {
                print_group("check/sidecars/whisper-stt", &["(no args)"]);
                return Ok(());
            }
            _ => {
                bail!("Run `cargo xtask check sidecars --list` for supported paths.");
            }
        }
    }

    if path.is_empty() {
        bail!("Missing sidecars check target. Run `cargo xtask check sidecars --list`.");
    }

    let root = project_root();
    match path[0].as_str() {
        "qt-capture" => {
            if path.len() == 1 {
                check_qt_capture_wrapper(&root)?;
                return check_qt_capture_native(&root);
            }

            if path.len() != 2 {
                bail!("Usage: cargo xtask check sidecars qt-capture <wrapper|native>");
            }

            match path[1].as_str() {
                "wrapper" => check_qt_capture_wrapper(&root),
                "native" => check_qt_capture_native(&root),
                other => bail!(
                    "Unknown qt-capture check target '{}'. Use `wrapper` or `native`.",
                    other
                ),
            }
        }
        "paddle-ocr" => {
            if path.len() > 2 {
                bail!("Usage: cargo xtask check sidecars paddle-ocr [python]");
            }

            if path.len() == 2 && path[1].as_str() != "python" {
                bail!("Unknown paddle-ocr check target '{}'. Use `python`.", path[1]);
            }

            run_cmd(
                "python3",
                &[
                    "-m",
                    "compileall",
                    "-q",
                    "sidecars/paddle-ocr/src",
                    "sidecars/paddle-ocr/scripts",
                    "sidecars/paddle-ocr/download_models.py",
                ],
                &root,
            )
        }
        "whisper-stt" => {
            if path.len() != 1 {
                bail!("Usage: cargo xtask check sidecars whisper-stt");
            }

            run_cmd(
                "cmake",
                &[
                    "-S",
                    "sidecars/whisper-stt",
                    "-B",
                    "sidecars/whisper-stt/build-xtask-check",
                ],
                &root,
            )
        }
        other => bail!(
            "Unknown sidecars check target '{}'. Run `cargo xtask check sidecars --list`.",
            other
        ),
    }
}

fn run_apps(list: bool, path: &[String]) -> Result<()> {
    if list {
        match path {
            [] => {
                print_group("check/apps", &["desktop", "cli", "shared"]);
            }
            [suite] if suite == "desktop" => {
                print_group("check/apps/desktop", &["renderer", "tauri"]);
            }
            [suite] if suite == "cli" => {
                print_group("check/apps/cli", &["(no args)"]);
            }
            [suite] if suite == "shared" => {
                print_group("check/apps/shared", &["(no args)"]);
            }
            _ => bail!("Run `cargo xtask check apps --list` for supported paths."),
        }

        return Ok(());
    }

    if path.is_empty() {
        bail!("Missing apps check target. Run `cargo xtask check apps --list`.");
    }

    let root = project_root();
    match path[0].as_str() {
        "desktop" => {
            if path.len() == 1 {
                run_cmd("npm", &["--prefix", "apps/desktop/renderer", "run", "tsc"], &root)?;
                return run_cmd(
                    "cargo",
                    &["check", "--manifest-path", "apps/desktop/Cargo.toml"],
                    &root,
                );
            }

            if path.len() != 2 {
                bail!("Usage: cargo xtask check apps desktop [renderer|tauri]");
            }

            match path[1].as_str() {
                "renderer" => run_cmd("npm", &["--prefix", "apps/desktop/renderer", "run", "tsc"], &root),
                "tauri" => run_cmd(
                    "cargo",
                    &["check", "--manifest-path", "apps/desktop/Cargo.toml"],
                    &root,
                ),
                other => bail!(
                    "Unknown desktop check target '{}'. Use `renderer` or `tauri`.",
                    other
                ),
            }
        }
        "cli" => {
            if path.len() != 1 {
                bail!("Usage: cargo xtask check apps cli");
            }

            run_ts_check(&root, "apps/cli", "apps/cli/tsconfig.json")
        }
        "shared" => {
            if path.len() != 1 {
                bail!("Usage: cargo xtask check apps shared");
            }

            run_ts_check(&root, "apps/desktop/renderer", "apps/shared/tsconfig.json")
        }
        other => bail!("Unknown apps check suite '{}'. Run `cargo xtask check apps --list`.", other),
    }
}

fn check_qt_capture_wrapper(root: &std::path::Path) -> Result<()> {
    run_cmd(
        "cargo",
        &["check", "--manifest-path", "sidecars/qt-capture/Cargo.toml"],
        root,
    )
}

fn check_qt_capture_native(root: &std::path::Path) -> Result<()> {
    run_cmd(
        "cmake",
        &[
            "-S",
            "sidecars/qt-capture/native",
            "-B",
            "sidecars/qt-capture/native/build-xtask-check",
        ],
        root,
    )
}

fn run_ts_check(root: &std::path::Path, npm_prefix: &str, tsconfig_path: &str) -> Result<()> {
    run_cmd(
        "npm",
        &[
            "--prefix",
            npm_prefix,
            "exec",
            "tsc",
            "--",
            "--noEmit",
            "-p",
            tsconfig_path,
        ],
        root,
    )
}
