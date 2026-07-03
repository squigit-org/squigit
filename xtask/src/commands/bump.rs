use crate::registry::manifest::{Operation, VersionScheme};
use crate::registry::Registry;
use crate::{components, workspace, Runtime, XtaskResult};
use regex::Regex;
use semver::Version;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use toml_edit::{value, DocumentMut};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if !args.is_empty() {
            return super::fail(runtime, "repository CalVer bump does not accept a version.");
        }
        let version = runtime.today_calver();
        let files = registry.bump_files(None);
        return match workspace::release::bump_root(runtime, &version, &files) {
            Ok(()) => 0,
            Err(error) => super::fail(runtime, &error),
        };
    }

    let component = match super::component_operation(runtime, registry, Operation::Bump) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let version = match component.manifest.version.scheme {
        VersionScheme::Semver => {
            let [version] = args else {
                return super::fail(runtime, "SemVer bump requires exactly one VERSION.");
            };
            if Version::parse(version).is_err() {
                return super::fail(runtime, &format!("'{version}' is not valid SemVer."));
            }
            version.clone()
        }
        VersionScheme::Calver => {
            if !args.is_empty() {
                return super::fail(runtime, "CalVer bump does not accept a version.");
            }
            next_calver(
                &runtime.today_calver(),
                component.current_version.as_deref(),
            )
        }
        VersionScheme::None => {
            return super::fail(runtime, "This component is not versioned.");
        }
    };
    let files = registry.bump_files(Some(component));
    if let Err(error) = components::bump(runtime, component, &version, &files) {
        return super::fail(runtime, &error);
    }
    if component.manifest.version.include_root {
        let root_version = runtime.today_calver();
        let root_files = registry.bump_files(None);
        if let Err(error) = workspace::release::bump_root(runtime, &root_version, &root_files) {
            return super::fail(runtime, &error);
        }
    }
    0
}

fn next_calver(today: &str, current: Option<&str>) -> String {
    let Some(current) = current else {
        return today.to_string();
    };
    if current == today {
        return format!("{today}.1");
    }
    let prefix = format!("{today}.");
    if let Some(suffix) = current.strip_prefix(&prefix) {
        if let Ok(sequence) = suffix.parse::<u64>() {
            return format!("{today}.{}", sequence + 1);
        }
    }
    today.to_string()
}

#[derive(Clone, Copy)]
pub(crate) enum ChangelogMode {
    None,
    Heading,
    Tbd,
    RootTbd,
}

pub(crate) fn apply(
    runtime: &Runtime,
    label: &str,
    version: &str,
    files: &[PathBuf],
    changelog_mode: ChangelogMode,
) -> XtaskResult {
    let date = runtime.today_date();
    let mut results = Vec::with_capacity(files.len());

    for path in files {
        let changed = update_file(path, version, &date, changelog_mode)?;
        results.push((path, changed));
    }

    if results.iter().any(|(_, changed)| *changed) {
        runtime.success(&format!("Bumped {label} to {version}"));
    } else {
        runtime.success(&format!("{label} is already at {version}"));
    }
    if matches!(
        changelog_mode,
        ChangelogMode::Heading | ChangelogMode::RootTbd
    ) {
        println!("  date: {date}");
    }
    let root_changelog = runtime.repo_root.join("CHANGELOG.md");
    for (path, changed) in results {
        let state = if changed { "updated" } else { "unchanged" };
        let label = runtime.relative_path(path);
        let label = if path == &root_changelog {
            runtime.console.link(&label, &file_url(path))
        } else {
            label
        };
        println!("  {state}: {label}");
    }
    if matches!(changelog_mode, ChangelogMode::RootTbd) {
        let label = runtime.relative_path(&root_changelog);
        let link = runtime.console.link(&label, &file_url(&root_changelog));
        runtime.note(&format!("  [!] Replace TBD with what changed @ {link}."));
    }
    Ok(())
}

fn file_url(path: &Path) -> String {
    let path = path
        .to_string_lossy()
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('#', "%23")
        .replace('\\', "/");
    if path.starts_with('/') {
        format!("file://{path}")
    } else {
        format!("file:///{path}")
    }
}

fn update_file(
    path: &Path,
    version: &str,
    date: &str,
    changelog_mode: ChangelogMode,
) -> XtaskResult<bool> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Version file has no valid file name: {}", path.display()))?;

    match name {
        "VERSION" => update_plain_version(path, version),
        "CHANGELOG.md" => update_changelog(path, version, date, changelog_mode),
        "package.json" => update_json_version(path, version),
        "package-lock.json" => update_package_lock(path, version),
        "Cargo.toml" => update_cargo_version(path, version),
        "CMakeLists.txt" => update_cmake_version(path, version),
        "__init__.py" => update_python_version(path, version),
        "index.js" => update_napi_version_guards(path, version),
        _ => Err(format!("Unsupported version file: {}", path.display())),
    }
}

fn update_plain_version(path: &Path, version: &str) -> XtaskResult<bool> {
    let updated = format!("{version}\n");
    let current = fs::read_to_string(path).unwrap_or_default();
    write_if_changed(path, &current, updated)
}

fn update_json_version(path: &Path, version: &str) -> XtaskResult<bool> {
    let content = read_file(path, "JSON file")?;
    let (updated, changed) = update_json_version_text(&content, version)?;
    if changed {
        write_file(path, &updated)?;
    }
    Ok(changed)
}

fn update_json_version_text(content: &str, version: &str) -> XtaskResult<(String, bool)> {
    let mut document: Value =
        serde_json::from_str(content).map_err(|error| format!("Invalid JSON: {error}"))?;
    let current = document
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| "JSON file has no top-level string 'version'.".to_string())?;
    if current == version {
        return Ok((content.to_string(), false));
    }

    document["version"] = Value::String(version.to_string());
    let updated = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("Could not encode JSON: {error}"))?;
    Ok((format!("{updated}\n"), true))
}

fn update_package_lock(path: &Path, version: &str) -> XtaskResult<bool> {
    let content = read_file(path, "package lock")?;
    let (updated, changed) = update_package_lock_text(&content, version)?;
    if changed {
        write_file(path, &updated)?;
    }
    Ok(changed)
}

fn update_package_lock_text(content: &str, version: &str) -> XtaskResult<(String, bool)> {
    let mut document: Value =
        serde_json::from_str(content).map_err(|error| format!("Invalid package lock: {error}"))?;
    let top_version = document
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| "Package lock has no top-level string 'version'.".to_string())?;
    let package_version = document
        .get("packages")
        .and_then(|packages| packages.get(""))
        .and_then(|package| package.get("version"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Package lock has no packages[''].version string.".to_string())?;
    if top_version == version && package_version == version {
        return Ok((content.to_string(), false));
    }

    document["version"] = Value::String(version.to_string());
    document["packages"][""]["version"] = Value::String(version.to_string());
    let updated = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("Could not encode package lock: {error}"))?;
    Ok((format!("{updated}\n"), true))
}

fn update_cargo_version(path: &Path, version: &str) -> XtaskResult<bool> {
    let content = read_file(path, "Cargo manifest")?;
    let (updated, changed) = update_cargo_version_text(&content, version)?;
    if changed {
        write_file(path, &updated)?;
    }
    Ok(changed)
}

fn update_cargo_version_text(content: &str, version: &str) -> XtaskResult<(String, bool)> {
    let mut document = content
        .parse::<DocumentMut>()
        .map_err(|error| format!("Invalid Cargo manifest: {error}"))?;
    let current = document
        .get("package")
        .and_then(|package| package.get("version"))
        .and_then(|version| version.as_str())
        .ok_or_else(|| "Cargo manifest has no package.version string.".to_string())?;
    if current == version {
        return Ok((content.to_string(), false));
    }

    document["package"]["version"] = value(version);
    Ok((document.to_string(), true))
}

fn update_python_version(path: &Path, version: &str) -> XtaskResult<bool> {
    let content = read_file(path, "Python version source")?;
    let (updated, changed) = update_python_version_text(&content, version)?;
    if changed {
        write_file(path, &updated)?;
    }
    Ok(changed)
}

fn update_python_version_text(content: &str, version: &str) -> XtaskResult<(String, bool)> {
    let variable =
        Regex::new(r#"__version__\s*=\s*"[^"]+""#).expect("Python version variable regex is valid");
    let documentation =
        Regex::new(r"@version\s+[^\s\n]+").expect("Python version documentation regex is valid");
    if !variable.is_match(content) || !documentation.is_match(content) {
        return Err("Python source must contain both __version__ and @version.".to_string());
    }

    let updated = documentation
        .replace_all(
            &variable.replace_all(content, format!("__version__ = \"{version}\"")),
            format!("@version {version}"),
        )
        .to_string();
    let changed = updated != content;
    Ok((updated, changed))
}

fn update_cmake_version(path: &Path, version: &str) -> XtaskResult<bool> {
    let content = read_file(path, "CMake file")?;
    let (updated, changed) = update_cmake_version_text(&content, version)?;
    if changed {
        write_file(path, &updated)?;
    }
    Ok(changed)
}

fn update_cmake_version_text(content: &str, version: &str) -> XtaskResult<(String, bool)> {
    let project = Regex::new(r"(?i)^(\s*project\(\s*[^\s\)]+)([^\)]*)\)\s*$")
        .expect("CMake project regex is valid");
    let existing_version =
        Regex::new(r"(?i)\s+VERSION\s+[^\s\)]+").expect("CMake version regex is valid");
    let mut found = false;
    let mut updated = String::new();

    for line in content.lines() {
        if let Some(captures) = project.captures(line) {
            found = true;
            let prefix = captures.get(1).map_or("", |value| value.as_str());
            let rest = captures.get(2).map_or("", |value| value.as_str());
            let rest = existing_version.replace_all(rest, "");
            updated.push_str(&format!("{prefix} VERSION {version}{rest})"));
        } else {
            updated.push_str(line);
        }
        updated.push('\n');
    }
    if !content.ends_with('\n') {
        updated.pop();
    }
    if !found {
        return Err("CMake file has no project(...) declaration.".to_string());
    }

    let changed = updated != content;
    Ok((updated, changed))
}

fn update_napi_version_guards(path: &Path, version: &str) -> XtaskResult<bool> {
    let content = read_file(path, "NAPI wrapper")?;
    let (updated, changed) = update_napi_version_guards_text(&content, version)?;
    if changed {
        write_file(path, &updated)?;
    }
    Ok(changed)
}

fn update_napi_version_guards_text(content: &str, version: &str) -> XtaskResult<(String, bool)> {
    let comparison = Regex::new(r"bindingPackageVersion !== '[^']+'").expect("NAPI regex is valid");
    let message = Regex::new(r"expected [^\s]+ but got").expect("NAPI message regex is valid");
    if !comparison.is_match(content) || !message.is_match(content) {
        return Err("NAPI wrapper has no generated package-version guards.".to_string());
    }

    let updated = message
        .replace_all(
            &comparison.replace_all(content, format!("bindingPackageVersion !== '{version}'")),
            format!("expected {version} but got"),
        )
        .to_string();
    let changed = updated != content;
    Ok((updated, changed))
}

fn update_changelog(
    path: &Path,
    version: &str,
    date: &str,
    mode: ChangelogMode,
) -> XtaskResult<bool> {
    let (include_tbd, merge_existing) = match mode {
        ChangelogMode::Heading => (false, false),
        ChangelogMode::Tbd => (true, false),
        ChangelogMode::RootTbd => (true, true),
        ChangelogMode::None => {
            return Err(format!(
                "No changelog policy was selected for {}.",
                path.display()
            ))
        }
    };
    let content = if path.is_file() {
        read_file(path, "changelog")?
    } else {
        "# Changelog\n\nAll notable changes...\n\n".to_string()
    };
    let (updated, changed) =
        insert_changelog_section(&content, version, date, include_tbd, merge_existing);
    if changed || !path.is_file() {
        write_file(path, &updated)?;
        return Ok(true);
    }
    Ok(false)
}

fn insert_changelog_section(
    content: &str,
    version: &str,
    date: &str,
    include_tbd: bool,
    merge_existing: bool,
) -> (String, bool) {
    let heading = Regex::new(&format!(r"(?m)^## \[{}\].*$", regex::escape(version)))
        .expect("Changelog heading regex is valid");
    let sections = collect_changelog_sections(content);

    if let Some((heading_end, body_end)) = sections.iter().find_map(|section| {
        heading
            .is_match(&content[section.0..section.1])
            .then_some((section.1, section.2))
    }) {
        if include_tbd && merge_existing {
            let body = &content[heading_end..body_end];
            let merged = ensure_tbd_scaffold(body);
            if merged != body {
                let mut updated = String::new();
                updated.push_str(&content[..heading_end]);
                updated.push_str(&merged);
                updated.push_str(&content[body_end..]);
                return (updated, true);
            }
        }
        return (content.to_string(), false);
    }

    let insert_at = sections.first().map_or(content.len(), |section| section.0);
    let section = build_changelog_section(version, date, include_tbd);
    let (head, tail) = content.split_at(insert_at);
    let mut updated = String::new();
    updated.push_str(head.trim_end());
    updated.push_str("\n\n");
    updated.push_str(&section);
    updated.push_str(tail.trim_start_matches('\n'));
    (updated, true)
}

fn collect_changelog_sections(content: &str) -> Vec<(usize, usize, usize)> {
    let heading = Regex::new(r"(?m)^## \[.*$").expect("Changelog section regex is valid");
    let headings = heading
        .find_iter(content)
        .map(|item| (item.start(), item.end()))
        .collect::<Vec<_>>();
    headings
        .iter()
        .enumerate()
        .map(|(index, (start, end))| {
            let body_end = headings.get(index + 1).map_or(content.len(), |next| next.0);
            (*start, *end, body_end)
        })
        .collect()
}

fn ensure_tbd_scaffold(body: &str) -> String {
    let mut updated = body.trim_end_matches('\n').to_string();
    let mut changed = false;
    for title in ["Added", "Changed", "Fixed"] {
        let heading = format!("### {title}");
        if !body.contains(&heading) {
            if !updated.is_empty() {
                updated.push_str("\n\n");
            }
            updated.push_str(&heading);
            updated.push_str("\n\n- TBD");
            changed = true;
        }
    }
    if changed {
        updated.push('\n');
        updated
    } else {
        body.to_string()
    }
}

fn build_changelog_section(version: &str, date: &str, include_tbd: bool) -> String {
    if include_tbd {
        format!(
            "## [{version}] - {date}\n\n### Added\n\n- TBD\n\n### Changed\n\n- TBD\n\n### Fixed\n\n- TBD\n\n"
        )
    } else {
        format!("## [{version}] - {date}\n\n")
    }
}

fn read_file(path: &Path, label: &str) -> XtaskResult<String> {
    fs::read_to_string(path)
        .map_err(|error| format!("Could not read {label} {}: {error}", path.display()))
}

fn write_file(path: &Path, content: &str) -> XtaskResult {
    fs::write(path, content).map_err(|error| format!("Could not write {}: {error}", path.display()))
}

fn write_if_changed(path: &Path, current: &str, updated: String) -> XtaskResult<bool> {
    if current == updated {
        return Ok(false);
    }
    write_file(path, &updated)?;
    Ok(true)
}
