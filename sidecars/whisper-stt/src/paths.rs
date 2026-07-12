// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::{Path, PathBuf};

const DEFAULT_MODEL: &str = "ggml-tiny.en.bin";

pub fn default_model() -> &'static str {
    DEFAULT_MODEL
}

pub fn resolve_engine_path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("SQUIGIT_STT_ENGINE_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }

    candidate_engine_paths()
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "ERR_MISSING_STT_ENGINE".to_string())
}

pub fn resolve_model_path(model: &str) -> String {
    let model = if model.trim().is_empty() {
        DEFAULT_MODEL
    } else {
        model.trim()
    };
    let provided = PathBuf::from(model);
    if provided.is_absolute() && provided.is_file() {
        return provided.to_string_lossy().to_string();
    }

    candidate_model_paths(model)
        .into_iter()
        .find(|path| path.is_file())
        .unwrap_or(provided)
        .to_string_lossy()
        .to_string()
}

pub fn runtime_lib_dirs(engine_path: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(engine_dir) = engine_path.parent() {
        dirs.push(engine_dir.to_path_buf());
        if let Some(internal_dir) = engine_dir.parent() {
            dirs.push(internal_dir.to_path_buf());
        }
    }
    dedupe_existing_dirs(dirs)
}

fn candidate_engine_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let engine = engine_name();

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(bin_dir) = current_exe.parent() {
            paths.push(bin_dir.join("_internal").join("bin").join(engine));
            paths.push(bin_dir.join("_internal").join(engine));
            paths.push(bin_dir.join(engine));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join("_internal").join("bin").join(engine));
        paths.push(
            cwd.join("native")
                .join("build")
                .join("Release")
                .join(engine),
        );
        paths.push(cwd.join("native").join("build").join(engine));
        paths.push(
            cwd.join("native")
                .join("build")
                .join("bin")
                .join("Release")
                .join(engine),
        );
        paths.push(cwd.join("native").join("build").join("bin").join(engine));
        paths.push(
            cwd.join("sidecars")
                .join("whisper-stt")
                .join("native")
                .join("build")
                .join("Release")
                .join(engine),
        );
        paths.push(
            cwd.join("sidecars")
                .join("whisper-stt")
                .join("native")
                .join("build")
                .join(engine),
        );
    }

    paths
}

fn candidate_model_paths(model: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(bin_dir) = current_exe.parent() {
            paths.push(bin_dir.join("_internal").join("models").join(model));
            paths.push(bin_dir.join("models").join(model));
            if let Some(prefix) = bin_dir.parent() {
                paths.push(
                    prefix
                        .join("share")
                        .join("squigit-stt")
                        .join("models")
                        .join(model),
                );
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join("models").join(model));
        paths.push(
            cwd.join("sidecars")
                .join("whisper-stt")
                .join("models")
                .join(model),
        );
    }

    paths.push(PathBuf::from("/usr/share/squigit-stt/models").join(model));
    paths.push(PathBuf::from("/usr/local/share/squigit-stt/models").join(model));
    paths.push(PathBuf::from("/opt/homebrew/share/squigit-stt/models").join(model));

    if cfg!(windows) {
        paths.push(PathBuf::from(r"C:\Program Files\Squigit\stt\models").join(model));
    }

    paths
}

fn engine_name() -> &'static str {
    if cfg!(windows) {
        "whisper-stt-engine.exe"
    } else {
        "whisper-stt-engine"
    }
}

fn dedupe_existing_dirs(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for path in paths {
        if !path.is_dir() {
            continue;
        }
        if !out.iter().any(|existing| existing == &path) {
            out.push(path);
        }
    }
    out
}
