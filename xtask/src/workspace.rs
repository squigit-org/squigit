// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use semver::{Version, VersionReq};
use std::fs;
use std::path::{Path, PathBuf};
use toml_edit::{value, DocumentMut, Item};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum PackageId {
    Storage,
    Auth,
    Harness,
    Ocr,
    Brain,
    Squigit,
    Cli,
}

#[derive(Clone, Copy, Debug)]
pub struct PackageSpec {
    pub name: &'static str,
    pub manifest: &'static str,
    pub source_root: &'static str,
    pub publishable: bool,
}

pub const LIBRARY_IDS: [PackageId; 6] = [
    PackageId::Storage,
    PackageId::Auth,
    PackageId::Harness,
    PackageId::Ocr,
    PackageId::Brain,
    PackageId::Squigit,
];

pub const ALL_IDS: [PackageId; 7] = [
    PackageId::Storage,
    PackageId::Auth,
    PackageId::Harness,
    PackageId::Ocr,
    PackageId::Brain,
    PackageId::Squigit,
    PackageId::Cli,
];

pub fn spec(id: PackageId) -> PackageSpec {
    match id {
        PackageId::Storage => PackageSpec {
            name: "squigit-storage",
            manifest: "crates/squigit-storage/Cargo.toml",
            source_root: "crates/squigit-storage",
            publishable: true,
        },
        PackageId::Auth => PackageSpec {
            name: "squigit-auth",
            manifest: "crates/squigit-auth/Cargo.toml",
            source_root: "crates/squigit-auth",
            publishable: true,
        },
        PackageId::Harness => PackageSpec {
            name: "squigit-harness",
            manifest: "crates/squigit-harness/Cargo.toml",
            source_root: "crates/squigit-harness",
            publishable: true,
        },
        PackageId::Ocr => PackageSpec {
            name: "squigit-ocr",
            manifest: "squigit-ocr/Cargo.toml",
            source_root: "squigit-ocr",
            publishable: true,
        },
        PackageId::Brain => PackageSpec {
            name: "squigit-brain",
            manifest: "crates/squigit-brain/Cargo.toml",
            source_root: "crates/squigit-brain",
            publishable: true,
        },
        PackageId::Squigit => PackageSpec {
            name: "squigit-rs",
            manifest: "squigit-rs/Cargo.toml",
            source_root: "squigit-rs",
            publishable: true,
        },
        PackageId::Cli => PackageSpec {
            name: "squigit-cli",
            manifest: "squigit-cli/Cargo.toml",
            source_root: "squigit-cli",
            publishable: false,
        },
    }
}

pub fn package_version(root: &Path, id: PackageId) -> Result<Version, String> {
    let package = spec(id);
    let document = read_manifest(&root.join(package.manifest))?;
    document["package"]["version"]
        .as_str()
        .ok_or_else(|| format!("{} must declare an explicit package version", package.name))
        .and_then(parse_stable_version)
}

pub fn parse_stable_version(value: &str) -> Result<Version, String> {
    let parsed = Version::parse(value)
        .map_err(|error| format!("invalid semantic version {value:?}: {error}"))?;
    if !parsed.pre.is_empty() || !parsed.build.is_empty() {
        return Err(format!(
            "version {value:?} must use MAJOR.MINOR.PATCH without prerelease or build metadata"
        ));
    }
    Ok(parsed)
}

pub fn read_manifest(path: &Path) -> Result<DocumentMut, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    source
        .parse::<DocumentMut>()
        .map_err(|error| format!("could not parse {}: {error}", path.display()))
}

pub fn write_manifest(path: &Path, document: &DocumentMut) -> Result<(), String> {
    fs::write(path, document.to_string())
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

pub fn set_package_version(document: &mut DocumentMut, version: &Version) -> Result<(), String> {
    if document["package"]["version"].is_none() {
        return Err("package manifest does not contain an explicit version".to_string());
    }
    document["package"]["version"] = value(version.to_string());
    Ok(())
}

pub fn dependency_requirement(document: &DocumentMut, name: &str) -> Option<String> {
    let item = document.get("dependencies")?.get(name)?;
    if let Some(requirement) = item.as_str() {
        return Some(requirement.to_string());
    }
    item.as_inline_table()?
        .get("version")?
        .as_str()
        .map(str::to_string)
}

pub fn set_dependency_requirement(
    document: &mut DocumentMut,
    name: &str,
    version: &Version,
) -> Result<(), String> {
    let item = document
        .get_mut("dependencies")
        .and_then(Item::as_table_like_mut)
        .and_then(|dependencies| dependencies.get_mut(name))
        .ok_or_else(|| format!("manifest has no dependency named {name}"))?;
    let dependency = item.as_inline_table_mut().ok_or_else(|| {
        format!("dependency {name} must use an inline table with path and version")
    })?;
    if dependency
        .get("path")
        .and_then(|item| item.as_str())
        .is_none()
    {
        return Err(format!("dependency {name} must keep its local path"));
    }
    dependency.insert("version", toml_edit::Value::from(version.to_string()));
    Ok(())
}

pub fn requirement_accepts(requirement: &str, version: &Version) -> Result<bool, String> {
    VersionReq::parse(requirement)
        .map(|requirement| requirement.matches(version))
        .map_err(|error| format!("invalid dependency requirement {requirement:?}: {error}"))
}

pub fn manifest_path(root: &Path, id: PackageId) -> PathBuf {
    root.join(spec(id).manifest)
}

pub fn internal_dependency_ids(id: PackageId) -> &'static [PackageId] {
    match id {
        PackageId::Storage => &[],
        PackageId::Auth => &[PackageId::Storage],
        PackageId::Harness => &[PackageId::Storage],
        PackageId::Ocr => &[PackageId::Storage],
        PackageId::Brain => &[PackageId::Storage, PackageId::Auth, PackageId::Harness],
        PackageId::Squigit => &[
            PackageId::Storage,
            PackageId::Auth,
            PackageId::Harness,
            PackageId::Ocr,
            PackageId::Brain,
        ],
        PackageId::Cli => &[PackageId::Squigit],
    }
}

pub fn validate_manifests(root: &Path) -> Result<(), String> {
    let mut problems = Vec::new();
    for id in ALL_IDS {
        let package = spec(id);
        let path = root.join(package.manifest);
        let document = read_manifest(&path)?;
        if document["package"]["name"].as_str() != Some(package.name) {
            problems.push(format!(
                "{} declares the wrong package name",
                package.manifest
            ));
        }
        if document["package"]["version"].as_str().is_none() {
            problems.push(format!(
                "{} must declare an explicit version",
                package.manifest
            ));
        } else if let Err(error) = package_version(root, id) {
            problems.push(error);
        }
        if document["package"]["description"].as_str().is_none() {
            problems.push(format!("{} is missing a description", package.manifest));
        }
        for field in ["edition", "license", "repository"] {
            let item = &document["package"][field];
            let inherited = item
                .get("workspace")
                .and_then(Item::as_bool)
                .unwrap_or(false);
            if item.as_str().is_none() && !inherited {
                problems.push(format!(
                    "{} is missing package {field} metadata",
                    package.manifest
                ));
            }
        }
        let publish_disabled = document
            .get("package")
            .and_then(|package| package.get("publish"))
            .and_then(Item::as_bool)
            == Some(false);
        if package.publishable && publish_disabled {
            problems.push(format!(
                "{} is unexpectedly marked publish = false",
                package.manifest
            ));
        }
        for dependency_id in internal_dependency_ids(id) {
            let dependency = spec(*dependency_id);
            let Some(item) = document
                .get("dependencies")
                .and_then(|table| table.get(dependency.name))
            else {
                problems.push(format!(
                    "{} is missing dependency {}",
                    package.name, dependency.name
                ));
                continue;
            };
            let Some(inline) = item.as_inline_table() else {
                problems.push(format!(
                    "{} dependency {} must use path + version",
                    package.name, dependency.name
                ));
                continue;
            };
            let Some(relative_path) = inline.get("path").and_then(|value| value.as_str()) else {
                problems.push(format!(
                    "{} dependency {} is missing path",
                    package.name, dependency.name
                ));
                continue;
            };
            let Some(requirement) = inline.get("version").and_then(|value| value.as_str()) else {
                problems.push(format!(
                    "{} dependency {} is missing version",
                    package.name, dependency.name
                ));
                continue;
            };
            let manifest_dir = path.parent().unwrap_or(root);
            let expected = root.join(dependency.source_root);
            if normalize_path(&manifest_dir.join(relative_path)) != normalize_path(&expected) {
                problems.push(format!(
                    "{} dependency {} points to the wrong local path",
                    package.name, dependency.name
                ));
            }
            match package_version(root, *dependency_id)
                .and_then(|version| requirement_accepts(requirement, &version))
            {
                Ok(true) => {}
                Ok(false) => problems.push(format!(
                    "{} dependency {} requirement {} does not accept its local version",
                    package.name, dependency.name, requirement
                )),
                Err(error) => problems.push(error),
            }
        }
    }

    let ocr = read_manifest(&root.join(spec(PackageId::Ocr).manifest))?;
    if ocr["package"]["build"].as_bool() != Some(false) {
        problems.push("squigit-ocr must keep build = false".to_string());
    }
    let excludes = ocr["package"]["exclude"]
        .as_array()
        .map(|array| {
            array
                .iter()
                .filter_map(|value| value.as_str())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !excludes.contains(&"native/**") {
        problems.push("squigit-ocr must exclude native/** from its crate package".to_string());
    }

    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems.join("\n"))
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}
