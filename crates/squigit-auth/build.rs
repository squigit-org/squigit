// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    embed_google_credentials();
    embed_ota_public_key();
}

fn embed_google_credentials() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let embedded_path = out_dir.join("squigit-google-credentials.json");

    let payload = load_google_credentials_json().unwrap_or_default();
    if let Err(err) = fs::write(&embedded_path, payload) {
        panic!(
            "Failed to write embedded Google credentials at {}: {}",
            embedded_path.display(),
            err
        );
    }

    println!(
        "cargo:rustc-env=SQUIGIT_GOOGLE_CREDENTIALS_EMBEDDED_FILE={}",
        embedded_path.display()
    );
    println!("cargo:rerun-if-env-changed=SQUIGIT_GOOGLE_CREDENTIALS_JSON");
    println!("cargo:rerun-if-env-changed=SQUIGIT_GOOGLE_CREDENTIALS_PATH");

    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let manifest_dir = Path::new(&manifest_dir);
        println!(
            "cargo:rerun-if-changed={}",
            manifest_dir.join("assets").join("oauth").display()
        );
        for candidate in default_credentials_candidates(manifest_dir) {
            println!("cargo:rerun-if-changed={}", candidate.display());
        }
    }
}

fn default_credentials_candidates(manifest_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![manifest_dir
        .join("assets")
        .join("oauth")
        .join("credentials.json")];

    if let Some(workspace_root) = manifest_dir.parent().and_then(|path| path.parent()) {
        candidates.push(
            workspace_root
                .join("apps")
                .join("desktop")
                .join("src")
                .join("data")
                .join("credentials.json"),
        );
    }

    candidates
}

fn load_google_credentials_json() -> Option<String> {
    if let Ok(raw_json) = env::var("SQUIGIT_GOOGLE_CREDENTIALS_JSON") {
        let trimmed = raw_json.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(path) = env::var("SQUIGIT_GOOGLE_CREDENTIALS_PATH") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            match fs::read_to_string(trimmed) {
                Ok(contents) => return Some(contents),
                Err(err) => {
                    println!(
                        "cargo:warning=Failed to read SQUIGIT_GOOGLE_CREDENTIALS_PATH ({}): {}",
                        trimmed, err
                    );
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").ok()?);
    for candidate in default_credentials_candidates(&manifest_dir) {
        if let Ok(contents) = fs::read_to_string(&candidate) {
            return Some(contents);
        }
    }

    None
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
