// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::process;
use std::process::Command;

pub fn run(forwarded: &[String]) -> Result<(), String> {
    let root = process::workspace_root()?;
    if forwarded.is_empty() && crate::cache::should_skip(&root, "test")? {
        println!("[test] cached: clean tree at HEAD already tested");
        return Ok(());
    }
    process::run(
        Command::new("cargo")
            .args(["test", "--locked", "--workspace", "--all-targets"])
            .args(forwarded)
            .env("SQUIGIT_CLI_DEMO", "1")
            .current_dir(&root),
        "Rust workspace tests",
    )?;
    if forwarded.is_empty() {
        crate::cache::mark_ok(&root, "test")?;
    }
    Ok(())
}
