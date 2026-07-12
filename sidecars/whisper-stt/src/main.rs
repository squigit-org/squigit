// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod engine;
mod ipc;
mod paths;

use engine::NativeEngine;
use ipc::{SttCommand, SttEvent};
use std::io::{BufRead, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[squigit-stt] {error}");
            ExitCode::from(1)
        }
    }
}

fn run() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    if let Some(arg) = args.next() {
        match arg.as_str() {
            "--version" => {
                println!("{}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            other => return Err(format!("Unknown argument: {other}")),
        }
    }

    run_stdio()
}

fn run_stdio() -> Result<(), String> {
    let stdin = std::io::stdin();
    let mut engine: Option<NativeEngine> = None;

    for line in stdin.lock().lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.trim().is_empty() {
            continue;
        }

        let command = match serde_json::from_str::<SttCommand>(&line) {
            Ok(command) => command,
            Err(error) => {
                send_error(error.to_string());
                continue;
            }
        };

        let command = normalize_command(command);

        match &command {
            SttCommand::Start { .. } => {
                if engine.is_none() {
                    match NativeEngine::spawn() {
                        Ok(native) => engine = Some(native),
                        Err(error) => {
                            send_error(error.to_string());
                            continue;
                        }
                    }
                }
                if let Some(native) = engine.as_mut() {
                    if let Err(error) = native.send(&command) {
                        send_error(error.to_string());
                    }
                }
            }
            SttCommand::Stop => {
                if let Some(native) = engine.as_mut() {
                    if let Err(error) = native.send(&SttCommand::Stop) {
                        send_error(error.to_string());
                    }
                }
            }
            SttCommand::Quit => {
                if let Some(native) = engine.take() {
                    native.shutdown();
                }
                break;
            }
        }
    }

    if let Some(native) = engine.take() {
        native.shutdown();
    }

    Ok(())
}

fn normalize_command(command: SttCommand) -> SttCommand {
    match command {
        SttCommand::Start {
            model,
            language,
            device_index,
        } => {
            let model = paths::resolve_model_path(
                model
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(paths::default_model()),
            );
            let language = language
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "en".to_string());
            SttCommand::Start {
                model: Some(model),
                language: Some(language),
                device_index,
            }
        }
        other => other,
    }
}

fn send_error(message: String) {
    let event = SttEvent::Error { message };
    if let Ok(json) = serde_json::to_string(&event) {
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(stdout, "{json}");
        let _ = stdout.flush();
    }
}

fn print_help() {
    println!("squigit-stt");
    println!("Usage:");
    println!("  squigit-stt --version");
    println!("  squigit-stt --help");
    println!("  squigit-stt  # JSON-over-stdin mode");
}
