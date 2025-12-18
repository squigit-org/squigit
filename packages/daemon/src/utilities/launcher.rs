/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use anyhow::{anyhow, Context, Result};
use regex::Regex;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};

pub static CAPTURE_PID: AtomicU32 = AtomicU32::new(0);

pub fn run_capture(capture_path: &PathBuf) -> Result<PathBuf> {
    let mut child = Command::new(capture_path)
        .stdout(Stdio::piped())
        .spawn()
        .context("Failed to spawn Capture")?;

    CAPTURE_PID.store(child.id(), Ordering::SeqCst);

    let stdout = child.stdout.take().context("No stdout")?;
    let reader = BufReader::new(stdout);

    let path_regex = Regex::new(r#"([a-zA-Z]:\\[^ \n\r]+|/[^ \n\r]+)"#).unwrap();
    let mut detected_path: Option<PathBuf> = None;

    for line in reader.lines() {
        if let Ok(content) = line {
            if let Some(caps) = path_regex.captures(&content) {
                let p = PathBuf::from(&caps[0]);
                if p.extension().map_or(false, |ext| ext == "png") {
                    detected_path = Some(p);
                    break;
                }
            }
        }
    }

    let _ = child.wait();
    CAPTURE_PID.store(0, Ordering::SeqCst);

    detected_path.ok_or_else(|| anyhow!("Capture finished but no valid PNG path was output"))
}

pub fn spawn_electron(bin_dir: &Path, image_path: &PathBuf) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let mut app_bundle = None;
        for ancestor in bin_dir.ancestors().take(3) {
            if ancestor.extension().map_or(false, |e| e == "app") {
                app_bundle = Some(ancestor);
                break;
            }
        }

        if let Some(bundle) = app_bundle {
            Command::new("open")
                .arg("-a")
                .arg(bundle)
                .arg("--args")
                .arg(image_path)
                .arg("--no-sandbox")
                .spawn()
                .context("Failed to open macOS bundle")?;
            return Ok(());
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let electron_executable = if cfg!(target_os = "windows") {
            bin_dir.join("App").join("spatialshot.exe")
        } else {
            bin_dir.join("app").join("spatialshot")
        };

        let mut cmd = Command::new(electron_executable);

        cmd.arg(image_path);

        if cfg!(target_os = "linux") {
            cmd.arg("--no-sandbox");
        }

        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .context("Failed to launch UI")?;
    }

    Ok(())
}
