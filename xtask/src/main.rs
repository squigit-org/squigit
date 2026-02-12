// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Usage:
//!   cargo xtask build              Build everything (OCR + Capture)
//!   cargo xtask build-ocr          Build PaddleOCR sidecar executable
//!   cargo xtask build-capture      Build Capture Engine (Qt + Rust)
//!   cargo xtask build-capture-qt   Build Qt native only (no Rust)
//!   cargo xtask clean              Clean all build artifacts
//!   cargo xtask run <cmd>          Run Tauri commands (dev, build, etc.)

mod commands;
mod platforms;

use anyhow::Result;
use clap::{Parser, Subcommand};
use commands::{build, clean, dev};

#[derive(Parser)]
#[command(name = "xtask")]
#[command(about = "Build automation for sidecars")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Build everything or specific components
    Build {
        #[command(subcommand)]
        command: Option<BuildCommands>,
    },

    /// Clean all build artifacts
    Clean,

    /// Tauri commands (dev, build, etc.) + Extra arguments
    Run {
        #[arg(default_value = "dev")]
        cmd: String,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    Dev {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

#[derive(Subcommand)]
enum BuildCommands {
    /// Build PaddleOCR sidecar executable
    Ocr,
    /// Build Whisper STT sidecar executable
    Whisper,
    /// Build Capture Engine (Qt + Rust + Package)
    Capture,
    /// Build Qt native only (CMake only, no Bundle)
    CaptureQt,
    /// Build Tauri application for release
    App,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build { command } => match command {
            None => build::all()?,
            Some(BuildCommands::Ocr) => build::ocr()?,
            Some(BuildCommands::Whisper) => build::whisper()?,
            Some(BuildCommands::Capture) => build::capture()?,
            Some(BuildCommands::CaptureQt) => build::capture_qt_only()?,
            Some(BuildCommands::App) => build::app()?,
        },
        Commands::Clean => clean::all()?,
        Commands::Run { cmd, args } => dev::run(&cmd, &args)?,
        Commands::Dev { args } => dev::run("dev", &args)?,
    }

    Ok(())
}
