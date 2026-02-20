// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Context, Result};
use std::env;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, ExitCode, Stdio};
use sys_display_hotplug::DisplayWatcher;
use sys_shutter_suppressor::AudioGuard;
use sys_single_instance::InstanceLock;

use ops_chat_storage::{ChatData, ChatMetadata, ChatStorage};
use ops_profile_store::ProfileStore;

use crate::paths::QtPaths;

pub struct QtApp {
    args: Vec<String>,
}

impl QtApp {
    pub fn new() -> Self {
        let args: Vec<String> = env::args().skip(1).collect();
        Self { args }
    }

    pub fn run(&mut self) -> Result<ExitCode> {
        let _lock = InstanceLock::try_acquire("qt-capture")
            .context("Failed to acquire instance lock - is another capture running?")?;

        AudioGuard::mute();

        let mut child = self.spawn_process()?;
        let child_pid = child.id();

        let watcher = DisplayWatcher::start(move || {
            eprintln!("[qt-capture] Display topology changed! Killing Qt...");
            Self::kill_process(child_pid);
        });

        let exit_code = self.handle_ipc(&mut child);

        watcher.stop();
        let _ = child.wait();
        AudioGuard::unmute();

        Ok(exit_code)
    }

    fn spawn_process(&self) -> Result<Child> {
        let paths = QtPaths::resolve()?;
        let mut cmd = Command::new(&paths.bin);

        cmd.args(&self.args)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        for (key, val) in paths.env_vars {
            cmd.env(key, val);
        }

        cmd.spawn().context("Failed to spawn Qt binary")
    }

    fn handle_ipc(&self, child: &mut Child) -> ExitCode {
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut capture_success = false;
            let mut capture_path: Option<String> = None;

            for line in reader.lines() {
                match line {
                    Ok(msg) => {
                        let trimmed = msg.trim();
                        match trimmed {
                            "REQ_MUTE" => {}
                            "CAPTURE_SUCCESS" => {
                                capture_success = true;
                            }
                            "CAPTURE_FAIL" => {
                                break;
                            }
                            _ => {
                                if trimmed.starts_with('/') && capture_success {
                                    // Store in active profile's CAS
                                    match ProfileStore::new() {
                                        Ok(profile_store) => {
                                            if let Ok(Some(active_id)) = profile_store.get_active_profile_id() {
                                                let chats_dir = profile_store.get_chats_dir(&active_id);
                                                match ChatStorage::with_base_dir(chats_dir) {
                                                    Ok(storage) => {
                                                        match storage.store_image_from_path(trimmed) {
                                                            Ok(stored) => {
                                                                // Create a new chat for the captured image
                                                                let metadata = ChatMetadata::new(
                                                                    "New Chat".to_string(), 
                                                                    stored.hash.clone(), 
                                                                    None
                                                                );
                                                                let chat = ChatData::new(metadata.clone());
                                                                if let Err(e) = storage.save_chat(&chat) {
                                                                    eprintln!("[QtWrapper] Failed to save chat: {}", e);
                                                                }
                                                                
                                                                capture_path = Some(metadata.id.clone()); // We return chat ID, not file path
                                                                // Try to delete original temp file
                                                                let _ = std::fs::remove_file(trimmed);
                                                            }
                                                            Err(e) => {
                                                                eprintln!("[QtWrapper] Failed to store image: {}", e);
                                                                capture_path = Some(trimmed.to_string());
                                                            }
                                                        }
                                                    }
                                                    Err(e) => {
                                                        eprintln!("[QtWrapper] Failed to init storage: {}", e);
                                                        capture_path = Some(trimmed.to_string());
                                                    }
                                                }
                                            } else {
                                                eprintln!("[QtWrapper] No active profile found. Guest mode doesn't support direct capture to storage yet.");
                                                capture_path = Some(trimmed.to_string());
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("[QtWrapper] Failed to init profile store: {}", e);
                                            capture_path = Some(trimmed.to_string());
                                        }
                                    }
                                    break;
                                } else {
                                    if !trimmed.is_empty() {
                                        eprintln!("[Qt] {}", trimmed);
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            if let Some(res) = capture_path {
                println!("CHAT_ID:{}", res);
                ExitCode::from(0)
            } else {
                ExitCode::from(1)
            }
        } else {
            ExitCode::from(1)
        }
    }

    fn kill_process(pid: u32) {
        #[cfg(unix)]
        {
            let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output();
        }
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }
    }
}
