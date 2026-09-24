// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

const GUIDE: &str = include_str!("assets/knowledge/squigit_guide.md");
const CATALOG: &str = include_str!("assets/skills/catalog.json");
const SKILLS: &[(&str, &str)] = &[
    (
        "visual-evidence",
        include_str!("assets/skills/visual-evidence.md"),
    ),
    (
        "ocr-and-small-text",
        include_str!("assets/skills/ocr-and-small-text.md"),
    ),
    (
        "interface-navigation",
        include_str!("assets/skills/interface-navigation.md"),
    ),
    (
        "design-review",
        include_str!("assets/skills/design-review.md"),
    ),
    (
        "accessibility",
        include_str!("assets/skills/accessibility.md"),
    ),
    ("bug-triage", include_str!("assets/skills/bug-triage.md")),
    (
        "windows-diagnostics",
        include_str!("assets/skills/windows-diagnostics.md"),
    ),
    (
        "macos-diagnostics",
        include_str!("assets/skills/macos-diagnostics.md"),
    ),
    (
        "linux-diagnostics",
        include_str!("assets/skills/linux-diagnostics.md"),
    ),
    (
        "browser-diagnostics",
        include_str!("assets/skills/browser-diagnostics.md"),
    ),
    (
        "network-diagnostics",
        include_str!("assets/skills/network-diagnostics.md"),
    ),
    (
        "security-signals",
        include_str!("assets/skills/security-signals.md"),
    ),
    (
        "code-explanation",
        include_str!("assets/skills/code-explanation.md"),
    ),
    (
        "math-reasoning",
        include_str!("assets/skills/math-reasoning.md"),
    ),
    (
        "science-diagrams",
        include_str!("assets/skills/science-diagrams.md"),
    ),
    (
        "document-analysis",
        include_str!("assets/skills/document-analysis.md"),
    ),
    (
        "tables-and-spreadsheets",
        include_str!("assets/skills/tables-and-spreadsheets.md"),
    ),
    (
        "charts-and-dashboards",
        include_str!("assets/skills/charts-and-dashboards.md"),
    ),
    (
        "study-questions",
        include_str!("assets/skills/study-questions.md"),
    ),
    (
        "product-research",
        include_str!("assets/skills/product-research.md"),
    ),
    (
        "news-and-claims",
        include_str!("assets/skills/news-and-claims.md"),
    ),
    (
        "maps-and-places",
        include_str!("assets/skills/maps-and-places.md"),
    ),
    (
        "messages-and-email",
        include_str!("assets/skills/messages-and-email.md"),
    ),
    (
        "media-frames",
        include_str!("assets/skills/media-frames.md"),
    ),
];

fn knowledge_dir() -> Result<PathBuf, String> {
    squigit_storage::paths::base_config_dir()
        .map(|root| root.join("knowledge"))
        .ok_or_else(|| "Squigit config directory is unavailable".to_string())
}

fn write_if_changed(path: &std::path::Path, content: &str) -> Result<(), String> {
    if std::fs::read_to_string(path).ok().as_deref() == Some(content) {
        return Ok(());
    }
    std::fs::write(path, content).map_err(|error| error.to_string())
}

pub fn install() -> Result<PathBuf, String> {
    let root = knowledge_dir()?;
    let skills = root.join("skills");
    std::fs::create_dir_all(&skills).map_err(|error| error.to_string())?;
    let guide = root.join("squigit_guide.md");
    write_if_changed(&guide, GUIDE)?;
    write_if_changed(&skills.join("catalog.json"), CATALOG)?;
    for (id, content) in SKILLS {
        write_if_changed(&skills.join(format!("{id}.md")), content)?;
    }
    Ok(guide)
}

pub fn guide_path() -> Result<PathBuf, String> {
    Ok(knowledge_dir()?.join("squigit_guide.md"))
}

pub fn read_installed() -> Result<String, String> {
    std::fs::read_to_string(guide_path()?).map_err(|error| error.to_string())
}

pub fn read_skill(id: &str) -> Result<String, String> {
    if !SKILLS.iter().any(|(candidate, _)| *candidate == id) {
        return Err(format!("Unknown Squigit skill: {id}"));
    }
    std::fs::read_to_string(knowledge_dir()?.join("skills").join(format!("{id}.md")))
        .map_err(|error| error.to_string())
}

pub fn read_skill_catalog() -> Result<String, String> {
    std::fs::read_to_string(knowledge_dir()?.join("skills").join("catalog.json"))
        .map_err(|error| error.to_string())
}
