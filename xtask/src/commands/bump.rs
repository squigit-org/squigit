// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::args::{BumpArgs, BumpTarget, OcrKind};
use crate::{process, workspace};
use semver::Version;
use std::collections::HashMap;
use std::fs;
use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use workspace::{PackageId, ALL_IDS};

pub fn run(arguments: BumpArgs) -> Result<(), String> {
    let root = process::workspace_root()?;
    let next = workspace::parse_stable_version(&arguments.version)?;
    match arguments.target {
        BumpTarget::Ocr => match match arguments.ocr_kind {
            Some(kind) => kind,
            None => prompt_for_ocr_kind()?,
        } {
            OcrKind::Crate => bump_package(&root, PackageId::Ocr, &next),
            OcrKind::Engine => bump_ocr_engine(&root, &next),
        },
        target => bump_package(&root, package_id(target), &next),
    }
}

fn package_id(target: BumpTarget) -> PackageId {
    match target {
        BumpTarget::Storage => PackageId::Storage,
        BumpTarget::Auth => PackageId::Auth,
        BumpTarget::Harness => PackageId::Harness,
        BumpTarget::Brain => PackageId::Brain,
        BumpTarget::Squigit => PackageId::Squigit,
        BumpTarget::Cli => PackageId::Cli,
        BumpTarget::Ocr => PackageId::Ocr,
    }
}

fn prompt_for_ocr_kind() -> Result<OcrKind, String> {
    if !io::stdin().is_terminal() {
        return Err("noninteractive OCR bumps require --crate or --engine".to_string());
    }
    loop {
        println!("OCR version target:");
        println!("  1. Rust crate");
        println!("  2. Native engine");
        print!("Select [1/2]: ");
        io::stdout().flush().map_err(|error| error.to_string())?;
        let mut answer = String::new();
        io::stdin()
            .read_line(&mut answer)
            .map_err(|error| format!("could not read OCR selection: {error}"))?;
        match answer.trim() {
            "1" => return Ok(OcrKind::Crate),
            "2" => return Ok(OcrKind::Engine),
            _ => println!("Enter 1 for the Rust crate or 2 for the native engine."),
        }
    }
}

fn bump_package(root: &Path, target: PackageId, next: &Version) -> Result<(), String> {
    let package = workspace::spec(target);
    let current = workspace::package_version(root, target)?;
    require_increase(package.name, &current, next)?;

    let mut manifests = HashMap::new();
    let mut originals = HashMap::new();
    for id in ALL_IDS {
        let path = workspace::manifest_path(root, id);
        let original = fs::read_to_string(&path)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        originals.insert(path.clone(), original);
        manifests.insert(id, workspace::read_manifest(&path)?);
    }

    workspace::set_package_version(
        manifests
            .get_mut(&target)
            .ok_or_else(|| "target manifest was not loaded".to_string())?,
        next,
    )?;

    let mut changed_dependencies = Vec::new();
    let mut downstream_bumps = Vec::new();
    for dependent in ALL_IDS {
        if dependent == target {
            continue;
        }
        let dependency_name = package.name;
        let Some(requirement) = manifests
            .get(&dependent)
            .and_then(|manifest| workspace::dependency_requirement(manifest, dependency_name))
        else {
            continue;
        };
        let facade_floor = dependent == PackageId::Squigit
            && matches!(
                target,
                PackageId::Storage
                    | PackageId::Auth
                    | PackageId::Harness
                    | PackageId::Ocr
                    | PackageId::Brain
            );
        if facade_floor || !workspace::requirement_accepts(&requirement, next)? {
            workspace::set_dependency_requirement(
                manifests
                    .get_mut(&dependent)
                    .ok_or_else(|| "dependent manifest was not loaded".to_string())?,
                dependency_name,
                next,
            )?;
            changed_dependencies.push((dependent, requirement, next.to_string()));
            downstream_bumps.push(dependent);
        }
    }

    let mut changed_paths = vec![workspace::manifest_path(root, target)];
    for (dependent, _, _) in &changed_dependencies {
        let path = workspace::manifest_path(root, *dependent);
        if !changed_paths.contains(&path) {
            changed_paths.push(path);
        }
    }
    let lock_path = root.join("Cargo.lock");
    let lock_original = fs::read(&lock_path).ok();

    let transaction = (|| {
        for id in ALL_IDS {
            let path = workspace::manifest_path(root, id);
            if changed_paths.contains(&path) {
                workspace::write_manifest(
                    &path,
                    manifests
                        .get(&id)
                        .ok_or_else(|| "updated manifest was not loaded".to_string())?,
                )?;
            }
        }
        let status = Command::new("cargo")
            .args(["metadata", "--no-deps", "--format-version=1"])
            .current_dir(root)
            .stdout(Stdio::null())
            .status()
            .map_err(|error| format!("could not update Cargo.lock: {error}"))?;
        if !status.success() {
            return Err(format!("Cargo.lock update failed with {status}"));
        }
        Ok(())
    })();

    if let Err(error) = transaction {
        restore_files(&originals)?;
        restore_lock(&lock_path, lock_original.as_deref())?;
        return Err(error);
    }

    println!("{}  {} -> {}", package.name, current, next);
    for (dependent, old, new) in changed_dependencies {
        println!(
            "{} dependency  {} {} -> {}",
            workspace::spec(dependent).name,
            package.name,
            old,
            new
        );
    }
    downstream_bumps.sort_by_key(|id| workspace::spec(*id).name);
    downstream_bumps.dedup();
    if !downstream_bumps.is_empty() {
        println!("\nChoose and apply new versions before release:");
        for id in downstream_bumps {
            println!("  cargo xtask bump {} <VERSION>", bump_flag(id));
        }
    }
    Ok(())
}

fn bump_ocr_engine(root: &Path, next: &Version) -> Result<(), String> {
    let version_path = root.join("squigit-ocr/native/VERSION");
    let current_text = fs::read_to_string(&version_path)
        .map_err(|error| format!("could not read {}: {error}", version_path.display()))?;
    let current = workspace::parse_stable_version(current_text.trim())?;
    require_increase("native Squigit OCR", &current, next)?;

    let paths = [
        version_path,
        root.join("squigit-ocr/native/src/__init__.py"),
        root.join("squigit-ocr/native/src/config.py"),
        root.join("squigit-ocr/native/src/models.py"),
        root.join(".github/workflows/ocr-build-matrix.yml"),
    ];
    let mut originals = HashMap::new();
    for path in &paths {
        originals.insert(
            path.clone(),
            fs::read_to_string(path)
                .map_err(|error| format!("could not read {}: {error}", path.display()))?,
        );
    }

    let old = current.to_string();
    let new = next.to_string();
    let mut updates = HashMap::new();
    updates.insert(paths[0].clone(), format!("{new}\n"));
    for path in &paths[1..4] {
        let source = originals
            .get(path)
            .ok_or_else(|| format!("OCR source {} was not loaded", path.display()))?;
        let updated = source
            .replace(&format!("@version {old}"), &format!("@version {new}"))
            .replace(
                &format!("__version__ = \"{old}\""),
                &format!("__version__ = \"{new}\""),
            );
        if updated == *source {
            return Err(format!(
                "{} does not contain the expected OCR version {old}",
                path.display()
            ));
        }
        updates.insert(path.clone(), updated);
    }
    let workflow = originals
        .get(&paths[4])
        .ok_or_else(|| "OCR workflow was not loaded".to_string())?;
    let updated_workflow = workflow.replacen(
        &format!("default: \"{old}\""),
        &format!("default: \"{new}\""),
        1,
    );
    if updated_workflow == *workflow {
        return Err(format!(
            "OCR build workflow does not contain version default {old}"
        ));
    }
    updates.insert(paths[4].clone(), updated_workflow);

    for (path, source) in &updates {
        if let Err(error) = fs::write(path, source) {
            restore_files(&originals)?;
            return Err(format!("could not write {}: {error}", path.display()));
        }
    }
    println!("native squigit-ocr  {} -> {}", current, next);
    Ok(())
}

fn require_increase(name: &str, current: &Version, next: &Version) -> Result<(), String> {
    if next > current {
        Ok(())
    } else {
        Err(format!(
            "{name} version must increase: current {current}, requested {next}"
        ))
    }
}

fn restore_files(originals: &HashMap<PathBuf, String>) -> Result<(), String> {
    let mut errors = Vec::new();
    for (path, source) in originals {
        if let Err(error) = fs::write(path, source) {
            errors.push(format!("could not restore {}: {error}", path.display()));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

fn restore_lock(path: &Path, original: Option<&[u8]>) -> Result<(), String> {
    match original {
        Some(contents) => fs::write(path, contents)
            .map_err(|error| format!("could not restore {}: {error}", path.display())),
        None if path.exists() => fs::remove_file(path)
            .map_err(|error| format!("could not remove generated {}: {error}", path.display())),
        None => Ok(()),
    }
}

fn bump_flag(id: PackageId) -> &'static str {
    match id {
        PackageId::Storage => "--storage",
        PackageId::Auth => "--auth",
        PackageId::Harness => "--harness",
        PackageId::Ocr => "--ocr --crate",
        PackageId::Brain => "--brain",
        PackageId::Squigit => "--squigit",
        PackageId::Cli => "--cli",
    }
}
