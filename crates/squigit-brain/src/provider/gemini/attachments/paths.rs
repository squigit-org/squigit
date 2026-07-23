// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_storage::ThreadStorage;

pub(crate) fn get_active_storage() -> Result<ThreadStorage, String> {
    ThreadStorage::new().map_err(|e| e.to_string())
}

pub(crate) fn resolve_attachment_path_internal(path: &str) -> Result<std::path::PathBuf, String> {
    use std::fs;
    use std::path::{Path, PathBuf};

    let storage = get_active_storage()?;
    let incoming = PathBuf::from(path);
    let hash = if path.len() == 64 && path.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Some(path)
    } else {
        Path::new(path)
            .file_stem()
            .and_then(|value| value.to_str())
            .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
    };
    let Some(hash) = hash else {
        return Err(format!("Attachment is not a CAS object: {path}"));
    };
    let canonical = storage
        .find_object_blob(hash)
        .and_then(|path| fs::canonicalize(path).map_err(Into::into))
        .map_err(|error| error.to_string())?;
    if !incoming.is_absolute() || path == hash {
        return Ok(canonical);
    }
    let requested = fs::canonicalize(&incoming).map_err(|error| error.to_string())?;
    if requested == canonical {
        return Ok(canonical);
    }

    Err(format!(
        "Attachment path is not the canonical CAS object: {path}"
    ))
}
