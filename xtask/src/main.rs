// Copyright 2025 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Build automation for ocrmyimg
//!
//! Usage:
//!   cargo xtask build-sidecar    Build PaddleOCR sidecar executable
//!   cargo xtask build-app        Build Tauri application
//!   cargo xtask build            Build everything
//!   cargo xtask clean            Clean all build artifacts
//!   cargo xtask run <cmd>        Run Tauri commands (dev, build, etc.)

mod sidecar;
mod tauri;
mod utils;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "xtask")]
#[command(about = "Build automation for ocrmyimg")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Build everything (sidecar + app)
    Build,
    
    /// Build PaddleOCR sidecar executable
    BuildSidecar,
    
    /// Build Tauri application for release
    BuildApp,
    
    /// Clean all build artifacts
    Clean,
    
    /// Run Tauri commands (dev, build, etc.)
    Run {
        /// Tauri command to run (e.g., dev, build)
        #[arg(default_value = "dev")]
        cmd: String,
    },
    
    /// Start development mode
    Dev,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Build => {
            sidecar::build()?;
            tauri::build()?;
        }
        Commands::BuildSidecar => {
            sidecar::build()?;
        }
        Commands::BuildApp => {
            tauri::build()?;
        }
        Commands::Clean => {
            sidecar::clean()?;
            tauri::clean()?;
        }
        Commands::Run { cmd } => {
            tauri::run(&cmd)?;
        }
        Commands::Dev => {
            tauri::run("dev")?;
        }
    }
    
    Ok(())
}
