use anyhow::{Context, Result};
use std::env;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, ExitCode, Stdio};
use sys_display_hotplug::DisplayWatcher;
use sys_shutter_suppressor::AudioGuard;
use sys_single_instance::InstanceLock;

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

        // Restart Qt process on display changes
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
                                    capture_path = Some(trimmed.to_string());
                                    break;
                                } else {
                                    eprintln!("[Qt] {}", trimmed);
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            if let Some(path) = capture_path {
                println!("{}", path);
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
