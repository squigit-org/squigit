// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const DEMO_ENV: &str = "SQUIGIT_CLI_DEMO";
const EMBEDDED_CREDENTIALS_ENV: &str = "SQUIGIT_CLI_GOOGLE_CREDENTIALS_FILE";

fn main() {
    println!("cargo:rerun-if-env-changed={DEMO_ENV}");
    println!("cargo:rerun-if-changed=secrets/credentials.json");

    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let output_dir = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let output = output_dir.join("squigit-google-credentials.json");

    if demo_enabled() {
        fs::write(&output, "{}\n").expect("could not prepare demo credential placeholder");
    } else {
        copy_production_credentials(&manifest_dir, &output);
    }

    println!(
        "cargo:rustc-env={EMBEDDED_CREDENTIALS_ENV}={}",
        output.display()
    );
}

fn demo_enabled() -> bool {
    env::var(DEMO_ENV)
        .ok()
        .is_some_and(|value| !value.trim().is_empty() && value != "0")
}

fn copy_production_credentials(manifest_dir: &Path, output: &Path) {
    let source = manifest_dir.join("secrets/credentials.json");
    let content = fs::read_to_string(&source).unwrap_or_else(|_| {
        panic!(
            "missing {}; create it from secrets/credentials.example.json or run `cargo xtask dev --demo`",
            source.display()
        )
    });
    if content.trim().is_empty() || content.contains("replace-me") {
        panic!(
            "{} does not contain production Google OAuth credentials",
            source.display()
        );
    }
    fs::write(output, content).expect("could not embed Google OAuth credentials");
}
