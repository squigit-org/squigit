// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Result};
use xtask::{project_root, run_cmd};

use super::runner::print_group;

pub fn run(list: bool, category: &str, path: &[String]) -> Result<()> {
    match category {
        "sidecars" => run_sidecars(list, path),
        "apps" => run_apps(list, path),
        other => bail!("Unknown check category '{}'.", other),
    }
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
