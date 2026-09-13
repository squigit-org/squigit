// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::args::BuildTarget;
use crate::{ocr_build, process};
use std::process::Command;

pub fn run(target: BuildTarget) -> Result<(), String> {
    let root = process::workspace_root()?;
    match target {
        BuildTarget::Cli => {
            process::run(
                Command::new("cargo")
                    .args(["build", "--release", "--package", "squigit-cli"])
                    .current_dir(&root),
                "Squigit CLI release build",
            )?;
            let executable =
                process::target_directory(&root)?
                    .join("release")
                    .join(if cfg!(windows) {
                        "squigit.exe"
                    } else {
                        "squigit"
                    });
            println!("Built {}", executable.display());
            Ok(())
        }
        BuildTarget::Ocr => ocr_build::run(&root, false),
    }
}
