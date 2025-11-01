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

use anyhow::{anyhow, Result};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
// use std::process::exit; // No longer needed
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

mod platform;
mod shared;

use platform::*;
use shared::*;

fn main() -> Result<()> {
    let paths = setup_paths()?;

    // --- WRITE SCRIPT ONCE ---
    write_core_script(&paths)?;
    // --- END ---

    kill_running_packages(&paths); // Kill any old/stray processes first

    let cores = core_affinity::get_core_ids().unwrap_or_default();
    if !cores.is_empty() {
        core_affinity::set_for_current(cores[0]);
    }

    // --- NO MORE WATCHDOG ---

    // --- MAIN FLOW ---
    // run_grab_screen now does the capture AND returns the number of screens.
    let initial_monitor_count = run_grab_screen(&paths)?;
    println!(
        "grab-screen finished and reported {} monitor(s).",
        initial_monitor_count
    );

    let paths_monitor = paths.clone();
    let cores_monitor = cores.clone();
    let monitor_handle = thread::spawn(move || {
        if cores_monitor.len() >= 2 {
            core_affinity::set_for_current(cores_monitor[1]);
        }
        monitor_tmp(&paths_monitor, initial_monitor_count)
    });

    let monitor_res = monitor_handle
        .join()
        .unwrap_or(Err(anyhow!("Monitor thread panicked")));

    // This block handles errors from monitor_tmp (e.g., if drawview exits 1)
    if monitor_res.is_err() {
        kill_running_packages(&paths);
        monitor_res?;
    }

    Ok(())
}

fn monitor_tmp(paths: &AppPaths, monitor_count: u32) -> Result<()> {
    let (tx, rx) = mpsc::channel();
    let mut watcher: RecommendedWatcher = Watcher::new(
        move |res: Result<notify::Event, _>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Create(_)) {
                    tx.send(()).ok();
                }
            }
        },
        notify::Config::default(),
    )?;
    watcher.watch(&paths.tmp_dir, RecursiveMode::NonRecursive)?;

    // This loop now waits for the file count to match what
    // run_grab_screen reported.
    loop {
        let files = std::fs::read_dir(&paths.tmp_dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().ok().map(|ft| ft.is_file()).unwrap_or(false))
            .count();

        if files as u32 == monitor_count {
            println!("Monitor Thread: All screenshots detected. Running draw-view...");
            run_draw_view(paths)?;
            break;
        }
        let _ = rx.recv_timeout(Duration::from_millis(100));
    }

    loop {
        let out_files: Vec<PathBuf> = std::fs::read_dir(&paths.tmp_dir)?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                if let Some(name) = e.file_name().to_str() {
                    if name.starts_with('o') && name.ends_with(".png") {
                        return Some(e.path());
                    }
                }
                None
            })
            .collect();

        if !out_files.is_empty() {
            let out_path = &out_files[0];
            println!(
                "Monitor Thread: Output file {} detected. Running spatialshot...",
                out_path.display()
            );
            run_spatialshot(paths, out_path)?;
            return Ok(());
        }
        let _ = rx.recv_timeout(Duration::from_millis(100));
    }
}

