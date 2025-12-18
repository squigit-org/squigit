#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

mod utilities;
use anyhow::Result;

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    #[cfg(target_os = "linux")]
    {
        log::info!("Linux detected. Running capture logic directly.");
        if let Err(e) = utilities::capture::run() {
            log::error!("Capture failed: {}", e);
            std::process::exit(1);
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        utilities::hotkey::listen();
    }

    Ok(())
}
