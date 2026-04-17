// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Result};
use xtask::{project_root, run_cmd};

use super::runner::print_group;

pub fn run(list: bool, path: &[String]) -> Result<()> {
    if path.is_empty() {
        if list {
            print_group("crates", &["profile-store"]);
            return Ok(());
        }

        bail!("Missing crates suite. Run `cargo xtask test crates --list`.");
    }

    match path[0].as_str() {
        "profile-store" => run_profile_store(list, &path[1..]),
        other => bail!(
            "Unknown crates suite '{}'. Run `cargo xtask test crates --list`.",
            other
        ),
    }
}

fn run_profile_store(list: bool, path: &[String]) -> Result<()> {
    if list {
        if path.is_empty() {
            print_group("crates/profile-store", &["all"]);
            return Ok(());
        }

        bail!("Unexpected path for `cargo xtask test crates profile-store --list`.");
    }

    if !path.is_empty() {
        bail!("`cargo xtask test crates profile-store` does not accept sub-actions.");
    }

    println!("\nRunning crates/profile-store tests...");
    run_cmd(
        "cargo",
        &["test", "-p", "ops-profile-store"],
        &project_root(),
    )
}
