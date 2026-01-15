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
    /// Build everything (OCR sidecar + Capture Engine)
    Build,

    /// Build PaddleOCR sidecar executable
    BuildOcr,

    /// Build Capture Engine (Qt + Rust + Package)
    BuildCapture,

    /// Build Qt native only (CMake only, no Bundle)
    BuildCaptureQt,

    /// Build Tauri application for release
    BuildApp,

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

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build => build::all()?,
        Commands::BuildOcr => build::ocr()?,
        Commands::BuildCapture => build::capture()?,
        Commands::BuildCaptureQt => build::capture_qt_only()?,
        Commands::BuildApp => build::app()?,
        Commands::Clean => clean::all()?,
        Commands::Run { cmd, args } => dev::run(&cmd, &args)?,
        Commands::Dev { args } => dev::run("dev", &args)?,
    }

    Ok(())
}
