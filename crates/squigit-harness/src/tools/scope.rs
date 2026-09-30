// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use percent_encoding::percent_decode_str;
use regex::Regex;
use squigit_storage::{ThreadMessage, ThreadStorage};
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

const MAX_LISTED_PATHS: usize = 20;
const PUBLIC_ENV_SUFFIXES: &[&str] = &["example", "sample", "template", "dist"];
const PRIVATE_KEY_PREFIXES: &[&str] = &["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"];
const PRIVATE_KEY_EXTENSIONS: &[&str] = &["pem", "key", "p12", "pfx"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ToolScope {
    cited: BTreeSet<PathBuf>,
    files: BTreeSet<PathBuf>,
    directories: BTreeSet<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ResolvedPath {
    File(PathBuf),
    Directory(PathBuf),
}

impl ToolScope {
    pub fn from_messages<'a>(messages: impl IntoIterator<Item = &'a str>) -> Self {
        let mut scope = Self::default();
        for message in messages {
            for path in cited_paths(message) {
                scope.grant(&path);
            }
        }
        scope
    }

    pub fn for_conversation(conversation_id: &str) -> Result<Self, String> {
        let conversation = ThreadStorage::new()
            .and_then(|storage| storage.load_conversation(conversation_id))
            .map_err(|error| error.to_string())?;
        let mut scope = Self::default();
        for message in conversation.messages() {
            if let ThreadMessage::User {
                content,
                text_citations,
                ..
            } = message
            {
                for path in cited_paths(content) {
                    scope.grant(&path);
                }
                for citation in text_citations {
                    scope.grant(Path::new(&citation.path));
                }
            }
        }
        Ok(scope)
    }

    pub fn is_empty(&self) -> bool {
        self.cited.is_empty()
    }

    fn grant(&mut self, path: &Path) {
        if !path.is_absolute() {
            return;
        }
        self.cited.insert(lexical(path));
        match std::fs::canonicalize(path) {
            Ok(canonical) if canonical.is_dir() => {
                self.directories.insert(canonical);
            }
            Ok(canonical) => {
                self.files.insert(canonical);
            }
            Err(_) => {}
        }
    }

    pub(crate) fn roots(&self) -> Vec<ResolvedPath> {
        self.files
            .iter()
            .filter(|file| !self.directories.iter().any(|root| file.starts_with(root)))
            .cloned()
            .map(ResolvedPath::File)
            .chain(
                self.directories
                    .iter()
                    .cloned()
                    .map(ResolvedPath::Directory),
            )
            .collect()
    }

    pub(crate) fn resolve(&self, raw: &str) -> Result<ResolvedPath, String> {
        let requested = self.requested_path(raw)?;
        let canonical = match std::fs::canonicalize(&requested) {
            Ok(canonical) => canonical,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(if self.covers_lexically(&requested) {
                    format!(
                        "File not found: {}. It was shared in this conversation but no longer exists on disk.",
                        display_path(&requested)
                    )
                } else {
                    self.denied(&requested)
                });
            }
            Err(error) => {
                return Err(format!(
                    "Could not open {}: {error}",
                    display_path(&requested)
                ))
            }
        };
        let is_directory = canonical.is_dir();
        if !is_directory && self.files.contains(&canonical) {
            return Ok(ResolvedPath::File(canonical));
        }
        let Some(root) = self
            .directories
            .iter()
            .find(|root| canonical.starts_with(root))
        else {
            return Err(self.denied(&requested));
        };
        if is_sensitive_path(&canonical, root) {
            return Err(format!(
                "Access denied: {} is a secret or version-control file.",
                display_path(&requested)
            ));
        }
        Ok(if is_directory {
            ResolvedPath::Directory(canonical)
        } else {
            ResolvedPath::File(canonical)
        })
    }

    fn requested_path(&self, raw: &str) -> Result<PathBuf, String> {
        let cleaned = raw.replace('\0', "");
        let trimmed = cleaned.trim();
        let unwrapped = trimmed
            .strip_prefix('<')
            .and_then(|value| value.strip_suffix('>'))
            .unwrap_or(trimmed);
        let path = link_path(unwrapped).unwrap_or_else(|| {
            let literal = PathBuf::from(unwrapped);
            match unwrapped.strip_prefix('@') {
                Some(rest) if !literal.is_absolute() => PathBuf::from(rest),
                _ => literal,
            }
        });
        if path.is_absolute() {
            Ok(lexical(&path))
        } else {
            Err(format!(
                "The path must be absolute. {}",
                self.readable_summary()
            ))
        }
    }

    fn covers_lexically(&self, requested: &Path) -> bool {
        self.cited
            .iter()
            .any(|cited| requested == cited || requested.starts_with(cited))
    }

    fn denied(&self, requested: &Path) -> String {
        format!(
            "Access denied: {} was not shared in this conversation. {}",
            display_path(requested),
            self.readable_summary()
        )
    }

    fn readable_summary(&self) -> String {
        if self.files.is_empty() && self.directories.is_empty() {
            return "No files or folders were shared in this conversation.".to_string();
        }
        let mut entries =
            self.files
                .iter()
                .map(|file| display_path(file))
                .chain(self.directories.iter().map(|directory| {
                    format!("{}/ and everything inside it", display_path(directory))
                }))
                .collect::<Vec<_>>();
        let hidden = entries.len().saturating_sub(MAX_LISTED_PATHS);
        entries.truncate(MAX_LISTED_PATHS);
        let mut summary = format!("Readable paths: {}", entries.join(", "));
        if hidden > 0 {
            summary.push_str(&format!(", and {hidden} more"));
        }
        summary.push('.');
        summary
    }
}

pub(crate) fn is_sensitive_path(path: &Path, root: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    if relative
        .components()
        .any(|component| component.as_os_str() == ".git")
    {
        return true;
    }
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let name = name.to_ascii_lowercase();
    if name == ".env" {
        return true;
    }
    if let Some(suffix) = name.strip_prefix(".env.") {
        return !PUBLIC_ENV_SUFFIXES.contains(&suffix);
    }
    if PRIVATE_KEY_PREFIXES
        .iter()
        .any(|prefix| name.starts_with(prefix) && !name.ends_with(".pub"))
    {
        return true;
    }
    Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| PRIVATE_KEY_EXTENSIONS.contains(&extension))
}

pub(crate) fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

fn cited_paths(message: &str) -> Vec<PathBuf> {
    static MENTION: OnceLock<Regex> = OnceLock::new();
    let mention = MENTION.get_or_init(|| {
        Regex::new(r"\[[^\]\n]+\]\((<[^>\n]+>|[^)\n]+)\)").expect("citation pattern is valid")
    });
    mention
        .captures_iter(message)
        .filter_map(|capture| {
            let destination = capture.get(1)?.as_str().trim();
            let destination = destination
                .strip_prefix('<')
                .and_then(|value| value.strip_suffix('>'))
                .unwrap_or(destination)
                .trim();
            link_path(destination)
        })
        .collect()
}

fn strip_scheme<'a>(value: &'a str, scheme: &str) -> Option<&'a str> {
    value
        .get(..scheme.len())
        .filter(|prefix| prefix.eq_ignore_ascii_case(scheme))
        .map(|_| &value[scheme.len()..])
}

fn link_path(destination: &str) -> Option<PathBuf> {
    let rest =
        strip_scheme(destination, "folder://").or_else(|| strip_scheme(destination, "file://"))?;
    let decoded = percent_decode_str(rest).decode_utf8_lossy();
    if let Some(path) = decoded.strip_prefix('/') {
        if path.as_bytes().get(1) == Some(&b':') {
            return Some(PathBuf::from(path));
        }
        return Some(PathBuf::from(decoded.as_ref()));
    }
    Some(PathBuf::from(format!("//{decoded}")))
}

fn lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}
