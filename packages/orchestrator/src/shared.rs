/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

use anyhow::{bail, Context, Result};
use log::error;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::Sender;
use std::thread;
use std::time::Duration;

#[derive(Debug)]
pub enum MonitorEvent {
    ScreenshotsReady,
    SquiggleFinished { output_path: PathBuf },
    Error(String),
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub tmp_dir: PathBuf,
    pub bin_dir: PathBuf,
    pub electron_app_dir: PathBuf,
    pub electron_exe: PathBuf,
    pub squiggle_bin: PathBuf,
}

pub fn find_app_paths() -> Result<AppPaths> {
    let data_dir: PathBuf;
    let cache_dir: PathBuf;

    if cfg!(target_os = "windows") {
        data_dir = dirs::data_local_dir()
            .context("Could not find local app data directory (%LOCALAPPDATA%)")?
            .join("spatialshot");
        cache_dir = data_dir.clone();
    } else if cfg!(target_os = "macos") {
        data_dir = dirs::data_local_dir()
            .context("Could not find local data directory (~/Library/Application Support)")?
            .join("spatialshot");
        cache_dir = dirs::cache_dir()
            .context("Could not find cache directory (~/Library/Caches)")?
            .join("spatialshot");
    } else {
        data_dir = dirs::data_local_dir()
            .context("Could not find local data directory (~/.local/share)")?
            .join("spatialshot");
        cache_dir = dirs::cache_dir()
            .context("Could not find cache directory (~/.cache)")?
            .join("spatialshot");
    }

    let tmp_dir = cache_dir.join("tmp");
    let bin_dir = data_dir.join("bin");
    let electron_app_dir = data_dir.join("app");

    let electron_exe_name = if cfg!(target_os = "windows") {
        "spatialshot.exe"
    } else {
        "spatialshot"
    };
    let electron_exe = electron_app_dir.join(electron_exe_name);

    let squiggle_bin_name = if cfg!(target_os = "windows") {
        "squiggle.exe"
    } else {
        "squiggle"
    };
    let squiggle_bin = bin_dir.join(squiggle_bin_name);

    fs::create_dir_all(&data_dir).context("Failed to create data directory")?;
    fs::create_dir_all(&cache_dir).context("Failed to create cache directory")?;
    fs::create_dir_all(&bin_dir).context("Failed to create bin directory")?;

    Ok(AppPaths {
        data_dir,
        cache_dir,
        tmp_dir,
        bin_dir,
        electron_app_dir,
        electron_exe,
        squiggle_bin,
    })
}

pub fn run_command(
    program: &Path,
    args: &[&str],
    cwd: Option<&Path>,
    envs: Option<&[(&str, &str)]>,
) -> Result<()> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    if let Some(e) = envs {
        command.envs(e.iter().copied());
    }

    command.stdin(Stdio::null());
    command.stdout(Stdio::null());
    command.stderr(Stdio::null());

    let status = command
        .status()
        .with_context(|| format!("Failed to execute command: {}", program.display()))?;

    if !status.success() {
        error!(
            "Command failed: '{}' with status: {}",
            program.display(),
            status
        );
        bail!("Command failed: {}", program.display());
    }
    Ok(())
}

pub fn spawn_command(
    program: &Path,
    args: &[&str],
    cwd: Option<&Path>,
    envs: Option<&[(&str, &str)]>,
) -> Result<()> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    if let Some(e) = envs {
        command.envs(e.iter().copied());
    }

    command.stdin(Stdio::null());
    command.stdout(Stdio::null());
    command.stderr(Stdio::null());

    command
        .spawn()
        .with_context(|| format!("Failed to spawn command: {}", program.display()))?;
    Ok(())
}

fn find_squiggle_output(tmp_dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = fs::read_dir(tmp_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                if file_name.starts_with('o') && file_name.ends_with(".png") {
                    return Some(path);
                }
            }
        }
    }
    None
}

pub fn monitor_tmp_directory(
    tx: Sender<MonitorEvent>,
    paths: AppPaths,
    is_wayland: bool,
    expected_monitors: u32,
) {
    let start_time = std::time::Instant::now();
    let timeout = Duration::from_secs(10);
    let mut screenshot_event_sent = false;

    while start_time.elapsed() < timeout {
        match fs::read_dir(&paths.tmp_dir) {
            Ok(entries) => {
                let png_files: Vec<(u32, PathBuf)> = entries
                    .filter_map(Result::ok)
                    .map(|e| e.path())
                    .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("png"))
                    .filter_map(|p| {
                        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                            if !stem.starts_with('o') {
                                if let Ok(num) = stem.parse::<u32>() {
                                    return Some((num, p));
                                }
                            }
                        }
                        None
                    })
                    .collect();

                if is_wayland {
                    if !png_files.is_empty() {

                        if tx
                            .send(MonitorEvent::ScreenshotsReady)
                            .is_ok()
                        {
                            screenshot_event_sent = true;
                            break;
                        } else {
                            error!("[MONITOR] Channel closed while sending ScreenshotsReady (Wayland).");
                            return;
                        }
                    }
                } else {
                    if png_files.len() >= expected_monitors as usize {
                        let mut found_monitors = std::collections::HashSet::new();
                        for (num, _) in &png_files {
                            found_monitors.insert(*num);
                        }
                        let all_present =
                            (1..=expected_monitors).all(|i| found_monitors.contains(&i));

                        if all_present {
                            if tx.send(MonitorEvent::ScreenshotsReady).is_ok() {
                                screenshot_event_sent = true;
                                break;
                            } else {
                                error!("[MONITOR] Channel closed while sending ScreenshotsReady (X11/Other).");
                                return;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("[MONITOR] Error reading tmp dir: {}", e);
            }
        }
        thread::sleep(Duration::from_millis(100));
    }

    if !screenshot_event_sent {
        error!("[MONITOR] Timeout waiting for screenshots.");
        let _ = tx.send(MonitorEvent::Error(
            "Timeout waiting for screenshots.".to_string(),
        ));
        return;
    }

    let start_time_squiggle = std::time::Instant::now();
    let timeout_squiggle = Duration::from_secs(60 * 5);

    while start_time_squiggle.elapsed() < timeout_squiggle {
        if let Some(output_path) = find_squiggle_output(&paths.tmp_dir) {
            if tx
                .send(MonitorEvent::SquiggleFinished { output_path })
                .is_ok()
            {
                return;
            } else {
                error!("[MONITOR] Channel closed while sending SquiggleFinished.");
                return;
            }
        }
        thread::sleep(Duration::from_millis(200));
    }

    error!("[MONITOR] Timeout waiting for squiggle output (o*.png).");
    let _ = tx.send(MonitorEvent::Error(
        "Timeout waiting for squiggle output.".to_string(),
    ));
}
