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
use fs2::FileExt;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs::File;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

mod platform;
mod shared;

use platform::*;
use shared::*;

fn acquire_lock_or_exit() -> Result<File> {
    let lock_path = std::env::temp_dir().join("spatialshot.lock");
    let file = File::create(&lock_path)?;

    match file.try_lock_exclusive() {
        Ok(_) => {
            println!("Acquired instance lock at {}", lock_path.display());
            Ok(file)
        }
        Err(_) => Err(anyhow!(
            "Another instance of spatialshot-orchestrator is already running."
        )),
    }
}

fn main() -> Result<()> {
    let _lock_file = match acquire_lock_or_exit() {
        Ok(file) => file,
        Err(e) => {
            eprintln!("{}", e);
            return Ok(());
        }
    };

    let paths = setup_paths()?;
    kill_running_packages(&paths);

    let initial_monitor_count = get_monitor_count(&paths)?;
    println!("Detected {} monitor(s).", initial_monitor_count);

    let cores = core_affinity::get_core_ids().unwrap_or_default();
    if !cores.is_empty() {
        core_affinity::set_for_current(cores[0]);
    }

    let running = Arc::new(AtomicBool::new(true));

    run_grab_screen(&paths)?;

    let paths_monitor = paths.clone();
    let running_monitor = running.clone();
    let cores_monitor = cores.clone();
    let monitor_handle = thread::spawn(move || {
        if cores_monitor.len() >= 2 {
            core_affinity::set_for_current(cores_monitor[1]);
        }
        let res = monitor_tmp(
            &paths_monitor,
            running_monitor.clone(),
            initial_monitor_count,
        );
        if res.is_err() {
            running_monitor.store(false, Ordering::SeqCst);
        }
        res
    });

    let paths_safety = paths;
    let running_safety = running.clone();
    let cores_safety = cores.clone();
    let safety_handle = thread::spawn(move || {
        if cores_safety.len() >= 3 {
            core_affinity::set_for_current(cores_safety[2]);
        }
        safety_monitor(&paths_safety, running_safety, initial_monitor_count)
    });

    let monitor_res = monitor_handle.join().unwrap();
    let safety_res = safety_handle.join().unwrap();

    monitor_res?;
    safety_res?;

    Ok(())
}

fn monitor_tmp(paths: &AppPaths, running: Arc<AtomicBool>, monitor_count: u32) -> Result<()> {
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

    loop {
        if !running.load(Ordering::SeqCst) {
            return Ok(());
        }

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
        if !running.load(Ordering::SeqCst) {
            return Ok(());
        }

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
            running.store(false, Ordering::SeqCst);
            return Ok(());
        }
        let _ = rx.recv_timeout(Duration::from_millis(100));
    }
}

fn safety_monitor(
    paths: &AppPaths,
    running: Arc<AtomicBool>,
    initial_monitor_count: u32,
) -> Result<()> {
    let start_time = Instant::now();
    let timeout = Duration::from_secs(60);

    loop {
        if !running.load(Ordering::SeqCst) {
            println!("Safety Thread: Monitor thread finished. Exiting.");
            return Ok(());
        }

        if start_time.elapsed() > timeout {
            println!("Safety Thread: Timeout exceeded! Killing processes and exiting.");
            running.store(false, Ordering::SeqCst);
            kill_running_packages(paths);
            std::process::exit(1);
        }

        let current_count = get_monitor_count(paths)?;
        if current_count != initial_monitor_count {
            println!(
                "Safety Thread: Monitor count changed! ({} -> {}). Killing processes and exiting.",
                initial_monitor_count, current_count
            );
            running.store(false, Ordering::SeqCst);

            kill_running_packages(paths);
            std::process::exit(1);
        }

        thread::sleep(Duration::from_millis(100));
    }
}
