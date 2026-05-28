// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use std::fs;
use std::net::TcpStream;
use std::process::Command as StdCommand;
use xtask::{run_cmd, run_cmd_with_node_bin, tauri_dir, ui_dir, electron_dir};

pub fn run(cmd: &str, tray_mode: bool, electron: bool, extra_args: &[String]) -> Result<()> {
    let ui = ui_dir();
    let app = if electron { electron_dir() } else { tauri_dir() };
    let node_bin = if electron { app.join("node_modules").join(".bin") } else { ui.join("node_modules").join(".bin") };

    let binaries_dir = app.join("binaries");
    if !binaries_dir.exists() || fs::read_dir(&binaries_dir)?.next().is_none() {
        anyhow::bail!(
            "no sidecar binaries found in {}.\n    Run `cargo xtask build` (or build the
appropriate sidecars) before running `cargo xtask dev`",
            binaries_dir.display()
        );
    }

    if !ui.join("node_modules").exists() {
        println!("\nInstalling npm dependencies...");
        run_cmd("npm", &["install"], &ui)?;
    }

    if electron {
        println!("\nRunning: electron dev mode");

        // 1. Start the renderer Vite dev server as a background process
        //    with VITE_PLATFORM=electron so the build-time alias resolves
        //    to src/platform/electron/ instead of src/platform/tauri/
        println!("  Starting renderer dev server (VITE_PLATFORM=electron)...");
        let npm_path = which::which("npm").unwrap_or_else(|_| "npm".into());
        let mut vite_child = StdCommand::new(&npm_path)
            .args(["run", "dev"])
            .current_dir(&ui)
            .env("VITE_PLATFORM", "electron")
            .spawn()
            .expect("Failed to start renderer dev server");

        // 2. Wait for port 1420 to be ready (up to 15s)
        println!("  Waiting for renderer on port 1420...");
        let mut ready = false;
        for _ in 0..30 {
            if TcpStream::connect("127.0.0.1:1420").is_ok() {
                ready = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        if !ready {
            let _ = vite_child.kill();
            anyhow::bail!("Renderer dev server did not start on port 1420 within 15s");
        }
        println!("  Renderer ready.");

        // 3. Build the electron main process
        run_cmd("npm", &["run", "build"], &app)?;

        // 4. Launch electron
        let electron_result = run_cmd_with_node_bin("electron", &[".", "--no-sandbox"], &app, &node_bin);

        // 5. Clean up: kill the Vite dev server when electron exits
        let _ = vite_child.kill();
        let _ = vite_child.wait();

        return electron_result;
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

