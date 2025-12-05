#![windows_subsystem = "windows"]

/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */
mod utilities;

use anyhow::Result;

/// The main entry point for the Spatialshot Kernel.
///
/// This function's behavior changes based on the operating system:
/// - On **Linux**, it runs the capture logic once immediately and then exits.
/// - On **Windows and macOS**, it starts a persistent process that listens for the
///   global hotkey (Super+Shift+A) to trigger the capture logic.
fn main() -> Result<()> {
    #[cfg(target_os = "linux")]
    {
        // On Linux, initialize a logger, run once, and exit.
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
        log::info!("Linux detected. Running capture logic directly.");
        let result = utilities::capture::run();
        if result.is_err() {
            // Exit with a non-zero status code to indicate failure.
            std::process::exit(1);
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        // On Windows and macOS, start the blocking hotkey listener.
        // The listener has its own logger initialization.
        utilities::hotkey::listen();
    }

    Ok(())
}
