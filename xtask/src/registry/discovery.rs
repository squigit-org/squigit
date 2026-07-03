use super::manifest::{ContextKind, ManifestHeader};
use std::fs;
use std::path::{Path, PathBuf};

pub const MANIFEST_NAME: &str = "xtask.toml";
pub const NO_CONTEXT_MESSAGE: &str = "Current directory is not an xtask context. Run from the repository root or a component directory containing xtask.toml.";

pub fn require_context_manifest(cwd: &Path) -> Result<PathBuf, String> {
    let path = cwd.join(MANIFEST_NAME);
    if path.is_file() {
        path.canonicalize()
            .map_err(|error| format!("Could not resolve {}: {error}", path.display()))
    } else {
        Err(NO_CONTEXT_MESSAGE.to_string())
    }
}

pub fn read_header(path: &Path) -> Result<ManifestHeader, String> {
    let body = fs::read_to_string(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    toml::from_str(&body).map_err(|error| format!("Invalid {}: {error}", path.display()))
}

pub fn find_repository_root(cwd: &Path, local_kind: ContextKind) -> Result<PathBuf, String> {
    if local_kind == ContextKind::Repository {
        return cwd
            .canonicalize()
            .map_err(|error| format!("Could not resolve {}: {error}", cwd.display()));
    }

    for ancestor in cwd.ancestors().skip(1) {
        let candidate = ancestor.join(MANIFEST_NAME);
        if !candidate.is_file() {
            continue;
        }
        if read_header(&candidate)
            .is_ok_and(|header| header.context.kind == ContextKind::Repository)
        {
            return ancestor
                .canonicalize()
                .map_err(|error| format!("Could not resolve {}: {error}", ancestor.display()));
        }
    }

    Err("Could not locate the repository xtask.toml above this component context.".to_string())
}

pub fn discover_component_manifests(
    repo_root: &Path,
    roots: &[String],
) -> (Vec<PathBuf>, Vec<String>) {
    let mut manifests = Vec::new();
    let mut errors = Vec::new();

    for root in roots {
        let relative = Path::new(root);
        if let Err(error) = validate_relative_path(relative) {
            errors.push(format!("discovery root '{root}': {error}"));
            continue;
        }
        let path = repo_root.join(relative);
        if !path.is_dir() {
            errors.push(format!("discovery root does not exist: {}", path.display()));
            continue;
        }
        visit(&path, &mut manifests, &mut errors);
    }

    manifests.sort();
    manifests.dedup();
    (manifests, errors)
}

fn visit(current: &Path, manifests: &mut Vec<PathBuf>, errors: &mut Vec<String>) {
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(error) => {
            errors.push(format!("Could not read {}: {error}", current.display()));
            return;
        }
    };

    let mut entries = entries.flatten().collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                errors.push(format!("Could not inspect {}: {error}", path.display()));
                continue;
            }
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            visit(&path, manifests, errors);
        } else if file_type.is_file() && entry.file_name() == MANIFEST_NAME {
            match path.canonicalize() {
                Ok(path) => manifests.push(path),
                Err(error) => errors.push(format!("Could not resolve {}: {error}", path.display())),
            }
        }
    }
}

pub fn validate_relative_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("path may not be empty".to_string());
    }
    if path.is_absolute() {
        return Err("absolute paths are not allowed".to_string());
    }
    if path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir
                | std::path::Component::RootDir
                | std::path::Component::Prefix(_)
        )
    }) {
        return Err("paths may not escape their owning context".to_string());
    }
    Ok(())
}
