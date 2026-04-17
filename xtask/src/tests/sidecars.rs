// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Result};

use super::runner::print_group;

pub fn run(list: bool, path: &[String]) -> Result<()> {
    if path.is_empty() {
        if list {
            print_group(
                "sidecars",
                &[
                    "ocr (coming soon)",
                    "stt (coming soon)",
                    "capture (coming soon)",
                ],
            );
            return Ok(());
        }

        bail!("Missing sidecars suite. Run `cargo xtask test sidecars --list`.");
    }

    if list {
        match path[0].as_str() {
            "ocr" => {
                print_group("sidecars/ocr", &["coming soon"]);
                return Ok(());
            }
            "stt" => {
                print_group("sidecars/stt", &["coming soon"]);
                return Ok(());
            }
            "capture" => {
                print_group("sidecars/capture", &["coming soon"]);
                return Ok(());
            }
            other => {
                bail!(
                    "Unknown sidecars suite '{}'. Run `cargo xtask test sidecars --list`.",
                    other
                )
            }
        }
    }

    match path[0].as_str() {
        "ocr" | "stt" | "capture" => {
            bail!("`cargo xtask test sidecars ...` execution is not implemented yet.")
        }
        other => bail!(
            "Unknown sidecars suite '{}'. Run `cargo xtask test sidecars --list`.",
            other
        ),
    }
}
