// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use xtask::{run_cmd, run_cmd_with_node_bin, ui_dir, tauri_dir};

pub fn run(cmd: &str, tray_mode: bool, extra_args: &[String]) -> Result<()> {
    let ui = ui_dir();
    let app = tauri_dir();
    let node_bin = ui.join("node_modules").join(".bin");

    if !ui.join("node_modules").exists() {
        println!("\nInstalling npm dependencies...");
        run_cmd("npm", &["install"], &ui)?;
    }

    let mut args: Vec<&str> = vec![cmd];
    if tray_mode {
        args.extend_from_slice(&["--", "--", "--background"]);
    }
    if !extra_args.is_empty() {
        if !tray_mode {
            args.push("--");
        }
        args.extend(extra_args.iter().map(|s| s.as_str()));
    }

    println!("\nRunning: tauri {}", args.join(" "));
    run_cmd_with_node_bin("tauri", &args, &app, &node_bin)?;

    Ok(())
}
