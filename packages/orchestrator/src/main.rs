/**
 *  Copyright (C) 2025  a7mddra-spatialshot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

use anyhow::{anyhow, Result};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
// use std::fs::File; // No longer needed
use std::path::PathBuf;
// use std::sync::atomic::{AtomicBool, Ordering}; // No longer needed
use std::sync::mpsc;
// use std::sync::Arc; // No longer needed
use std::thread;
use std::time::Duration;
// use fs2::FileExt; // No longer needed

// Declare modules
mod platform;
mod shared;

// Use modules
use platform::*;
use shared::*;

// --- SAFETY FUNCTION REMOVED ---
// fn acquire_lock_or_exit() -> Result<File> { ... }

fn main() -> Result<()> {
    // --- LOCK LOGIC REMOVED ---

    let paths = setup_paths()?;
    // We still keep this to clean up zombies from previous runs
    kill_running_packages(&paths);

    let initial_monitor_count = get_monitor_count(&paths)?;
    println!("Detected {} monitor(s).", initial_monitor_count);

    let cores = core_affinity::get_core_ids().unwrap_or_default();
    if !cores.is_empty() {
        core_affinity::set_for_current(cores[0]);
    }

    // --- COORDINATION ARCS REMOVED ---

    // This is synchronous, it waits.
    run_grab_screen(&paths)?;

    // Spawn the *only* background thread: the monitor
    let paths_monitor = paths.clone();
    let cores_monitor = cores.clone();
    let monitor_handle = thread::spawn(move || {
        if cores_monitor.len() >= 2 {
            core_affinity::set_for_current(cores_monitor[1]);
        }
        // Pass only the monitor count
        monitor_tmp(
            &paths_monitor,
            initial_monitor_count,
        )
    });

    // --- SAFETY THREAD SPAWN REMOVED ---

    // Wait for the monitor thread to finish
    // (i.e., after it has launched spatialshot)
    let monitor_res = monitor_handle.join().unwrap_or(Err(anyhow!("Monitor thread panicked")));

    // If the monitor thread panicked (e.g., file error),
    // we should clean up the draw-view it might have orphaned.
    if monitor_res.is_err() {
        kill_running_packages(&paths);
        monitor_res?; // Propagate the panic
    }

    Ok(())
}


fn monitor_tmp(
    paths: &AppPaths,
    monitor_count: u32,
) -> Result<()> {
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

    // --- Phase 1: Wait for grab-screen screenshots ---
    loop {
        // --- 'running' CHECK REMOVED ---

        let files = std::fs::read_dir(&paths.tmp_dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().ok().map(|ft| ft.is_file()).unwrap_or(false))
            .count();
            
        if files as u32 == monitor_count {
            println!("Monitor Thread: All screenshots detected. Running draw-view...");
            run_draw_view(paths)?;
            // --- 'draw_view_active' BOOL REMOVED ---
            break;
        }
        let _ = rx.recv_timeout(Duration::from_millis(100));
    }

    // --- Phase 2: Wait for draw-view output (o*.png) ---
    loop {
        // --- 'running' CHECK REMOVED ---

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
            // --- 'running' BOOL REMOVED ---
            return Ok(()); // Success!
        }
        let _ = rx.recv_timeout(Duration::from_millis(100));
    }
}
