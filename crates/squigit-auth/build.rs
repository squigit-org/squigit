// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    embed_ota_public_key();
}

fn embed_ota_public_key() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let embedded_path = out_dir.join("squigit-ota-public-key.pem");

    let payload = load_ota_public_key_pem().unwrap_or_default();
    if let Err(err) = fs::write(&embedded_path, payload) {
        panic!(
            "Failed to write embedded OTA public key at {}: {}",
            embedded_path.display(),
            err
        );
    }

    println!(
        "cargo:rustc-env=SQUIGIT_OTA_PUBLIC_KEY_EMBEDDED_FILE={}",
        embedded_path.display()
    );
    println!("cargo:rerun-if-env-changed=SQUIGIT_OTA_PUBLIC_KEY_PEM");
    println!("cargo:rerun-if-env-changed=SQUIGIT_OTA_PUBLIC_KEY_PATH");

    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let crypto_assets = Path::new(&manifest_dir).join("assets").join("crypto");
        println!("cargo:rerun-if-changed={}", crypto_assets.display());
        println!(
            "cargo:rerun-if-changed={}",
            crypto_assets.join("pub.pem").display()
        );
    }
}

fn load_ota_public_key_pem() -> Option<String> {
    if let Ok(pem) = env::var("SQUIGIT_OTA_PUBLIC_KEY_PEM") {
        let trimmed = pem.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(path) = env::var("SQUIGIT_OTA_PUBLIC_KEY_PATH") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            match fs::read_to_string(trimmed) {
                Ok(contents) => return Some(contents),
                Err(err) => {
                    println!(
                        "cargo:warning=Failed to read SQUIGIT_OTA_PUBLIC_KEY_PATH ({}): {}",
                        trimmed, err
                    );
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").ok()?);
    fs::read_to_string(manifest_dir.join("assets").join("crypto").join("pub.pem")).ok()
}
