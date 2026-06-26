// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Context, Result};
use chrono::Local;
use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::Path;
use toml_edit::{value, DocumentMut};
use xtask::project_root;

#[derive(Debug, Clone, Default)]
pub struct VersionOptions {
    pub explicit: Option<String>,
    pub shell: bool,
    pub renderer: bool,
    pub ocr: bool,
    pub stt: bool,
    pub repo: bool,
}

pub fn run(options: VersionOptions) -> Result<()> {
    let root = project_root();
    let target_count = [
        options.shell,
        options.renderer,
        options.ocr,
        options.stt,
        options.repo,
    ]
    .into_iter()
    .filter(|flag| *flag)
    .count();

    if target_count != 1 {
        anyhow::bail!(
            "Specify exactly one target flag: --shell, --renderer, --ocr, --stt, or --repo"
        );
    }

    let today = Local::now();
    let calver = format_calver(today);
    let iso_date = today.format("%Y-%m-%d").to_string();
    let mut changed_files = Vec::new();

    if options.shell {
        let shell_version = options
            .explicit
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("`cargo xtask version --shell` requires an explicit semver argument"))?;
        parse_semver(shell_version)?;

        for path in [
            root.join("apps").join("desktop").join("package.json"),
            root.join("crates").join("napi-bridge").join("package.json"),
        ] {
            if update_json_version_line(&path, shell_version)? {
                changed_files.push(path);
            }
        }

        let desktop_changelog = root.join("apps").join("desktop").join("CHANGELOG.md");
        if ensure_changelog_version_section(
            &desktop_changelog,
            shell_version,
            &iso_date,
            true,
            false,
        )? {
            changed_files.push(desktop_changelog);
        }

        let qt_cmake = root
            .join("sidecars")
            .join("qt-capture")
            .join("native")
            .join("CMakeLists.txt");
        if update_cmake_project_versions_file(&qt_cmake, shell_version)? {
            changed_files.push(qt_cmake);
        }

        let qt_cargo = root.join("sidecars").join("qt-capture").join("Cargo.toml");
        if update_cargo_package_version(&qt_cargo, shell_version)? {
            changed_files.push(qt_cargo);
        }

        let napi_cargo = root.join("crates").join("napi-bridge").join("Cargo.toml");
        if update_cargo_package_version(&napi_cargo, shell_version)? {
            changed_files.push(napi_cargo);
        }

        let napi_index = root.join("crates").join("napi-bridge").join("index.js");
        if update_napi_index_version_guard(&napi_index, shell_version)? {
            changed_files.push(napi_index);
        }

        if ensure_root_repo_version(&root, &calver, &iso_date)? {
            changed_files.push(root.join("CHANGELOG.md"));
            changed_files.push(root.join("VERSION"));
        }

        println!("Shell version updated to {shell_version}");
        println!("Repo version updated to {calver}");
    }

    if options.renderer {
        if options.explicit.is_some() {
            anyhow::bail!("`cargo xtask version --renderer` does not accept a version argument");
        }

        let renderer_pkg = root.join("apps").join("renderer").join("package.json");
        if update_json_version_line(&renderer_pkg, &calver)? {
            changed_files.push(renderer_pkg);
        }

        let renderer_changelog = root.join("apps").join("renderer").join("CHANGELOG.md");
        if ensure_changelog_version_section(
            &renderer_changelog,
            &calver,
            &iso_date,
            false,
            false,
        )? {
            changed_files.push(renderer_changelog);
        }

        println!("Renderer version updated to {calver}");
    }

    if options.ocr {
        let ocr_version = options
            .explicit
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("`cargo xtask version --ocr` requires an explicit semver argument"))?;
        parse_semver(ocr_version)?;

        let init_path = root
            .join("sidecars")
            .join("paddle-ocr")
            .join("src")
            .join("__init__.py");
        if update_python_version_file(&init_path, ocr_version)? {
            changed_files.push(init_path);
        }

        let changelog = root
            .join("sidecars")
            .join("paddle-ocr")
            .join("CHANGELOG.md");
        if ensure_changelog_version_section(&changelog, ocr_version, &iso_date, true, false)? {
            changed_files.push(changelog);
        }

        if ensure_root_repo_version(&root, &calver, &iso_date)? {
            changed_files.push(root.join("CHANGELOG.md"));
            changed_files.push(root.join("VERSION"));
        }

        println!("OCR version updated to {ocr_version}");
        println!("Repo version updated to {calver}");
    }

    if options.stt {
        let stt_version = options
            .explicit
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("`cargo xtask version --stt` requires an explicit semver argument"))?;
        parse_semver(stt_version)?;

        let cmake_path = root
            .join("sidecars")
            .join("whisper-stt")
            .join("CMakeLists.txt");
        if update_cmake_project_versions_file(&cmake_path, stt_version)? {
            changed_files.push(cmake_path);
        }

        let changelog = root
            .join("sidecars")
            .join("whisper-stt")
            .join("CHANGELOG.md");
        if ensure_changelog_version_section(&changelog, stt_version, &iso_date, true, false)? {
            changed_files.push(changelog);
        }

        if ensure_root_repo_version(&root, &calver, &iso_date)? {
            changed_files.push(root.join("CHANGELOG.md"));
            changed_files.push(root.join("VERSION"));
        }

        println!("STT version updated to {stt_version}");
        println!("Repo version updated to {calver}");
    }

    if options.repo {
        if options.explicit.is_some() {
            anyhow::bail!("`cargo xtask version --repo` does not accept a version argument");
        }

        if ensure_root_repo_version(&root, &calver, &iso_date)? {
            changed_files.push(root.join("CHANGELOG.md"));
            changed_files.push(root.join("VERSION"));
        }

        println!("Repo version updated to {calver}");
    }

    println!("\nChanged files:");
    for path in changed_files {
        println!(
            "  - {}",
            path.strip_prefix(&root).unwrap_or(path.as_path()).display()
        );
    }

    Ok(())
}

fn format_calver(now: chrono::DateTime<Local>) -> String {
    now.format("%y.%m.%d").to_string()
}

fn parse_semver(version: &str) -> Result<(u64, u64, u64)> {
    let re = Regex::new(r"^([0-9]+)\.([0-9]+)\.([0-9]+)$").expect("valid semver regex");
    let caps = re
        .captures(version.trim())
        .ok_or_else(|| anyhow::anyhow!("Invalid version '{version}'. Expected semver x.y.z"))?;

    let major = caps[1].parse::<u64>()?;
    let minor = caps[2].parse::<u64>()?;
    let patch = caps[3].parse::<u64>()?;

    Ok((major, minor, patch))
}

fn update_json_version_line(path: &Path, version: &str) -> Result<bool> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read JSON file: {}", path.display()))?;
    let mut json: Value = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse JSON file: {}", path.display()))?;
    let current = json
        .get("version")
        .and_then(|item| item.as_str())
        .ok_or_else(|| anyhow::anyhow!("Could not find top-level version in {}", path.display()))?;

    if current == version {
        return Ok(false);
    }

    json["version"] = Value::String(version.to_string());
    let updated = serde_json::to_string_pretty(&json)
        .with_context(|| format!("Failed to encode JSON file: {}", path.display()))?;
    fs::write(path, format!("{updated}\n"))?;
    Ok(true)
}

fn update_cargo_package_version(path: &Path, version: &str) -> Result<bool> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read Cargo manifest: {}", path.display()))?;
    let mut doc = content
        .parse::<DocumentMut>()
        .with_context(|| format!("Failed to parse Cargo manifest: {}", path.display()))?;

    let current = doc
        .get("package")
        .and_then(|item| item.get("version"))
        .and_then(|item| item.as_str())
        .map(ToString::to_string);

    if current.as_deref() == Some(version) {
        return Ok(false);
    }

    doc["package"]["version"] = value(version);
    fs::write(path, doc.to_string())?;
    Ok(true)
}

fn update_napi_index_version_guard(path: &Path, version: &str) -> Result<bool> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read NAPI wrapper: {}", path.display()))?;
    let compare_re = Regex::new(r"bindingPackageVersion !== '[^']+'").expect("valid regex");
    let message_re =
        Regex::new(r"expected [0-9]+\.[0-9]+\.[0-9]+ but got").expect("valid regex");

    let updated = message_re
        .replace_all(
            &compare_re.replace_all(&content, format!("bindingPackageVersion !== '{version}'")),
            format!("expected {version} but got"),
        )
        .to_string();

    if updated == content {
        return Ok(false);
    }

    fs::write(path, updated)?;
    Ok(true)
}

fn update_python_version_file(path: &Path, version: &str) -> Result<bool> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read Python file: {}", path.display()))?;

    let re_var = Regex::new(r#"__version__\s*=\s*"[^"]+""#).expect("valid regex");
    let re_doc = Regex::new(r#"@version\s+[^\s\n]+"#).expect("valid regex");

    let mut updated = re_var
        .replace_all(&content, format!("__version__ = \"{version}\""))
        .to_string();
    updated = re_doc
        .replace_all(&updated, format!("@version {version}"))
        .to_string();

    if updated != content {
        fs::write(path, updated)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

fn update_cmake_project_versions_file(path: &Path, version: &str) -> Result<bool> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read CMake file: {}", path.display()))?;

    let (updated, changed) = update_cmake_project_versions_text(&content, version);
    if changed {
        fs::write(path, updated)?;
    }

    Ok(changed)
}

fn update_cmake_project_versions_text(content: &str, version: &str) -> (String, bool) {
    let project_re =
        Regex::new(r"(?i)^(\s*project\(\s*[^\s\)]+)([^\)]*)\)\s*$").expect("valid project regex");
    let version_re = Regex::new(r"(?i)\s+VERSION\s+[^\s\)]+").expect("valid cmake version regex");

    let mut changed = false;
    let mut out = String::new();

    for line in content.lines() {
        if let Some(caps) = project_re.captures(line) {
            let prefix = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let rest = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let rest_no_version = version_re.replace_all(rest, "");
            let new_line = format!("{prefix} VERSION {version}{rest_no_version})");
            if new_line != line {
                changed = true;
            }
            out.push_str(&new_line);
            out.push('\n');
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }

    if !content.ends_with('\n') && out.ends_with('\n') {
        out.pop();
    }

    (out, changed)
}

fn ensure_root_repo_version(root: &Path, version: &str, date: &str) -> Result<bool> {
    let mut changed = false;
    let version_path = root.join("VERSION");
    let version_text = format!("{version}\n");
    let current = fs::read_to_string(&version_path).unwrap_or_default();
    if current != version_text {
        fs::write(&version_path, version_text)?;
        changed = true;
    }

    let changelog = root.join("CHANGELOG.md");
    if ensure_changelog_version_section(&changelog, version, date, true, true)? {
        changed = true;
    }

    Ok(changed)
}

fn ensure_changelog_version_section(
    path: &Path,
    version: &str,
    date: &str,
    include_tbd: bool,
    merge_existing: bool,
) -> Result<bool> {
    if !path.exists() {
        fs::write(path, "# Changelog\n\nAll notable changes...\n\n")?;
    }

    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read changelog: {}", path.display()))?;

    let (updated, changed) =
        insert_changelog_section(&content, version, date, include_tbd, merge_existing);
    if changed {
        fs::write(path, updated)?;
    }

    Ok(changed)
}

fn insert_changelog_section(
    content: &str,
    version: &str,
    date: &str,
    include_tbd: bool,
    merge_existing: bool,
) -> (String, bool) {
    let heading_re = Regex::new(&format!(r"(?m)^## \[{}\].*$", regex::escape(version)))
        .expect("valid heading regex");
    let section_matches = collect_changelog_sections(content);

    if let Some((idx, heading_start, heading_end, body_end)) = section_matches
        .iter()
        .enumerate()
        .find_map(|(idx, section)| {
            if heading_re.is_match(&content[section.0..section.1]) {
                Some((idx, section.0, section.1, section.2))
            } else {
                None
            }
        })
    {
        if include_tbd && merge_existing {
            let body = &content[heading_end..body_end];
            let merged_body = ensure_documented_scaffold(body);
            if merged_body == body {
                return (content.to_string(), false);
            }

            let mut out = String::new();
            out.push_str(&content[..heading_end]);
            out.push_str(&merged_body);
            out.push_str(&content[body_end..]);
            return (out, true);
        }

        let _ = (idx, heading_start);
        return (content.to_string(), false);
    }

    let insert_at = section_matches
        .first()
        .map(|section| section.0)
        .unwrap_or(content.len());
    let section = build_changelog_section(version, date, include_tbd);
    let (head, tail) = content.split_at(insert_at);

    let mut out = String::new();
    out.push_str(head.trim_end());
    out.push_str("\n\n");
    out.push_str(&section);
    out.push_str(tail.trim_start_matches('\n'));

    (out, true)
}

fn collect_changelog_sections(content: &str) -> Vec<(usize, usize, usize)> {
    let heading_re = Regex::new(r"(?m)^## \[.*$").expect("valid section regex");
    let headings = heading_re
        .find_iter(content)
        .map(|m| (m.start(), m.end()))
        .collect::<Vec<_>>();
    let mut sections = Vec::with_capacity(headings.len());

    for (idx, (start, end)) in headings.iter().enumerate() {
        let body_end = headings
            .get(idx + 1)
            .map(|(next_start, _)| *next_start)
            .unwrap_or(content.len());
        sections.push((*start, *end, body_end));
    }

    sections
}

fn ensure_documented_scaffold(body: &str) -> String {
    let mut out = body.trim_end_matches('\n').to_string();
    let mut changed = false;

    for title in ["Added", "Changed", "Fixed"] {
        let section_heading = format!("### {title}");
        if !body.contains(&section_heading) {
            if !out.is_empty() {
                out.push_str("\n\n");
            }
            out.push_str(&section_heading);
            out.push_str("\n\n- TBD");
            changed = true;
        }
    }

    if !changed {
        return body.to_string();
    }

    out.push('\n');
    out
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

#[cfg(test)]
mod tests {
    use super::{
        build_changelog_section, ensure_documented_scaffold, format_calver, insert_changelog_section,
        parse_semver, update_cmake_project_versions_text,
    };
    use chrono::{Local, TimeZone};

    #[test]
    fn parses_semver() {
        assert_eq!(parse_semver("1.2.3").expect("valid semver"), (1, 2, 3));
        assert!(parse_semver("1.2").is_err());
    }

    #[test]
    fn formats_calver_as_yy_mm_dd() {
        let dt = Local
            .with_ymd_and_hms(2026, 6, 26, 12, 0, 0)
            .single()
            .expect("datetime");
        assert_eq!(format_calver(dt), "26.06.26");
    }

    #[test]
    fn changelog_section_is_inserted_once() {
        let base =
            "# Changelog\n\nAll notable changes...\n\n## [0.1.0] - 2025-10-02\n\n### Added\n";
        let (updated, changed) =
            insert_changelog_section(base, "0.2.0", "2026-03-07", true, false);
        assert!(changed);
        assert!(updated.contains("## [0.2.0] - 2026-03-07"));
        assert!(updated.contains("TBD"));

        let (updated_again, changed_again) =
            insert_changelog_section(&updated, "0.2.0", "2026-03-07", true, false);
        assert!(!changed_again);
        assert_eq!(updated_again, updated);

        let (updated_no_tbd, changed_no_tbd) =
            insert_changelog_section(base, "26.03.07", "2026-03-07", false, false);
        assert!(changed_no_tbd);
        assert!(!updated_no_tbd.contains("TBD"));
    }

    #[test]
    fn same_day_root_merge_scaffolds_missing_sections() {
        let base = "# Changelog\n\nAll notable changes...\n\n## [26.06.26] - 2026-06-26\n\n### Changed\n\n- Repo restructuring\n";
        let (updated, changed) =
            insert_changelog_section(base, "26.06.26", "2026-06-26", true, true);
        assert!(changed);
        assert_eq!(updated.matches("## [26.06.26]").count(), 1);
        assert!(updated.contains("### Added"));
        assert!(updated.contains("### Changed"));
        assert!(updated.contains("### Fixed"));
    }

    #[test]
    fn scaffold_helper_is_stable_once_complete() {
        let body = "\n\n### Added\n\n- TBD\n\n### Changed\n\n- TBD\n\n### Fixed\n\n- TBD\n";
        assert_eq!(ensure_documented_scaffold(body), body);
    }

    #[test]
    fn cmake_project_versions_are_enforced() {
        let input = r#"
project(squigit-stt)
project(CAPTURE LANGUAGES CXX)
project(CAPTURE VERSION 1.0.0 LANGUAGES CXX OBJCXX)
"#;

        let (updated, changed) = update_cmake_project_versions_text(input, "2.3.4");
        assert!(changed);
        assert!(updated.contains("project(squigit-stt VERSION 2.3.4)"));
        assert!(updated.contains("project(CAPTURE VERSION 2.3.4 LANGUAGES CXX)"));
        assert!(updated.contains("project(CAPTURE VERSION 2.3.4 LANGUAGES CXX OBJCXX)"));
    }

    #[test]
    fn documented_sections_use_tbd_template() {
        let section = build_changelog_section("0.2.0", "2026-03-07", true);
        assert!(section.contains("### Added"));
        assert!(section.contains("- TBD"));
    }
}
