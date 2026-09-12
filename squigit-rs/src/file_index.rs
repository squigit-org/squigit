// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use fsindex::{Config as FsIndexConfig, EventKind, FileIndexer};
use nucleo_matcher::{
    pattern::{AtomKind, CaseMatching, Normalization, Pattern},
    Config as MatcherConfig, Matcher, Utf32Str,
};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, RwLock,
    },
    thread,
    time::Duration,
};
use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileIndexEntryKind {
    Directory,
    File,
}

#[derive(Clone, Debug)]
pub struct FileIndexEntry {
    pub name: String,
    pub path: PathBuf,
    pub kind: FileIndexEntryKind,
    pub extension: Option<String>,
}

#[derive(Clone, Debug)]
pub struct FileSearchMatch {
    pub entry: FileIndexEntry,
    pub score: u32,
}

#[derive(Clone, Debug)]
pub struct FileIndexOptions {
    pub extensions: Vec<String>,
    pub include_hidden: bool,
    pub respect_gitignore: bool,
    pub follow_symlinks: bool,
}

impl Default for FileIndexOptions {
    fn default() -> Self {
        Self {
            extensions: Vec::new(),
            include_hidden: false,
            respect_gitignore: true,
            follow_symlinks: false,
        }
    }
}

#[derive(Debug, Error)]
pub enum FileIndexError {
    #[error("The index root is not an absolute directory: {0}")]
    InvalidRoot(String),
    #[error("The path is not absolute: {0}")]
    RelativePath(String),
    #[error("The path does not exist: {0}")]
    MissingPath(String),
    #[error("The path is not a file or directory: {0}")]
    UnsupportedPath(String),
    #[error("Filesystem operation failed: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug)]
struct FileSearchIndexInner {
    root: PathBuf,
    options: FileIndexOptions,
    entries: RwLock<Vec<FileIndexEntry>>,
    stopped: AtomicBool,
}

#[derive(Clone, Debug)]
pub struct FileSearchIndex {
    inner: Arc<FileSearchIndexInner>,
}

impl FileSearchIndex {
    pub fn new(root: impl AsRef<Path>, options: FileIndexOptions) -> Result<Self, FileIndexError> {
        let root = root.as_ref();
        if !root.is_absolute() || !root.is_dir() {
            return Err(FileIndexError::InvalidRoot(root.display().to_string()));
        }
        let root = root.canonicalize()?;
        let entries = build_entries(&root, &options)?;
        let inner = Arc::new(FileSearchIndexInner {
            root,
            options,
            entries: RwLock::new(entries),
            stopped: AtomicBool::new(false),
        });
        start_watcher(&inner);
        Ok(Self { inner })
    }

    pub fn len(&self) -> usize {
        self.inner
            .entries
            .read()
            .map(|entries| entries.len())
            .unwrap_or_default()
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<FileSearchMatch> {
        if limit == 0 {
            return Vec::new();
        }
        let query = query.trim();
        let candidates = self
            .inner
            .entries
            .read()
            .map(|entries| entries.clone())
            .unwrap_or_default();
        let (direct_candidates, direct_fragment) =
            direct_path_candidates(query, &self.inner.root, &self.inner.options);

        let direct_pattern = Pattern::new(
            &direct_fragment,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
        );
        let mut direct_matcher = Matcher::new(MatcherConfig::DEFAULT);
        let mut direct_utf32_buffer = Vec::new();
        let mut direct_matches = direct_candidates
            .into_iter()
            .filter_map(|entry| {
                let score = if direct_fragment.is_empty() {
                    1
                } else {
                    direct_pattern.score(
                        Utf32Str::new(&entry.name, &mut direct_utf32_buffer),
                        &mut direct_matcher,
                    )?
                };
                Some(FileSearchMatch { entry, score })
            })
            .collect::<Vec<_>>();
        direct_matches.sort_by(|left, right| {
            kind_rank(left.entry.kind)
                .cmp(&kind_rank(right.entry.kind))
                .then_with(|| right.score.cmp(&left.score))
                .then_with(|| left.entry.path.cmp(&right.entry.path))
        });

        let mut seen = HashSet::new();
        let mut matches = Vec::with_capacity(limit);
        for direct_match in direct_matches.into_iter().take(limit) {
            seen.insert(direct_match.entry.path.clone());
            matches.push(direct_match);
        }
        if matches.len() == limit {
            return matches;
        }

        let mut unique = HashMap::<PathBuf, FileIndexEntry>::new();
        for entry in candidates {
            unique.entry(entry.path.clone()).or_insert(entry);
        }

        let normalized_query = query
            .strip_prefix(self.inner.root.to_string_lossy().as_ref())
            .unwrap_or(query)
            .trim_matches(['/', '\\'])
            .to_string();
        let pattern = Pattern::new(
            &normalized_query,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
        );
        let mut matcher = Matcher::new(MatcherConfig::DEFAULT.match_paths());
        let mut utf32_buffer = Vec::new();
        let mut fuzzy_matches = unique
            .into_values()
            .filter(|entry| !seen.contains(&entry.path))
            .filter_map(|entry| {
                let relative = entry
                    .path
                    .strip_prefix(&self.inner.root)
                    .unwrap_or(&entry.path)
                    .to_string_lossy();
                let score = if normalized_query.is_empty() {
                    1
                } else {
                    pattern.score(
                        Utf32Str::new(relative.as_ref(), &mut utf32_buffer),
                        &mut matcher,
                    )?
                };
                Some(FileSearchMatch { entry, score })
            })
            .collect::<Vec<_>>();
        fuzzy_matches.sort_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then_with(|| kind_rank(left.entry.kind).cmp(&kind_rank(right.entry.kind)))
                .then_with(|| left.entry.path.cmp(&right.entry.path))
        });
        matches.extend(fuzzy_matches.into_iter().take(limit - matches.len()));
        matches
    }

    pub fn resolve(path: impl AsRef<Path>) -> Result<FileIndexEntry, FileIndexError> {
        let path = path.as_ref();
        if !path.is_absolute() {
            return Err(FileIndexError::RelativePath(path.display().to_string()));
        }
        if !path.exists() {
            return Err(FileIndexError::MissingPath(path.display().to_string()));
        }
        let path = path.canonicalize()?;
        entry_for_path(&path)
            .ok_or_else(|| FileIndexError::UnsupportedPath(path.display().to_string()))
    }
}

impl Drop for FileSearchIndexInner {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
    }
}

fn kind_rank(kind: FileIndexEntryKind) -> u8 {
    match kind {
        FileIndexEntryKind::Directory => 0,
        FileIndexEntryKind::File => 1,
    }
}

fn normalized_extensions(options: &FileIndexOptions) -> HashSet<String> {
    options
        .extensions
        .iter()
        .map(|extension| extension.trim_start_matches('.').to_lowercase())
        .filter(|extension| !extension.is_empty())
        .collect()
}

fn is_supported_file(path: &Path, extensions: &HashSet<String>) -> bool {
    extensions.is_empty()
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extensions.contains(&extension.to_lowercase()))
            .unwrap_or(false)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

fn entry_for_path(path: &Path) -> Option<FileIndexEntry> {
    let metadata = fs::metadata(path).ok()?;
    let kind = if metadata.is_dir() {
        FileIndexEntryKind::Directory
    } else if metadata.is_file() {
        FileIndexEntryKind::File
    } else {
        return None;
    };
    Some(FileIndexEntry {
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| path.display().to_string()),
        path: path.to_path_buf(),
        kind,
        extension: path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase),
    })
}

fn build_config(options: &FileIndexOptions, extensions: &[String]) -> FsIndexConfig {
    FsIndexConfig::builder()
        .respect_gitignore(options.respect_gitignore)
        .include_hidden(options.include_hidden)
        .follow_symlinks(options.follow_symlinks)
        .extensions(extensions)
        .read_contents(false)
        .parse_structure(false)
        .build()
}

fn build_entries(
    root: &Path,
    options: &FileIndexOptions,
) -> Result<Vec<FileIndexEntry>, FileIndexError> {
    let extensions = normalized_extensions(options)
        .into_iter()
        .collect::<Vec<_>>();
    let config = build_config(options, &extensions);
    let indexer = FileIndexer::with_config(root, config);
    let mut entries = HashMap::<PathBuf, FileIndexEntry>::new();

    for file in indexer.files_parallel() {
        if let Some(entry) = entry_for_path(&file.path) {
            entries.insert(entry.path.clone(), entry);
        }
        let mut ancestor = file.path.parent();
        while let Some(directory) = ancestor {
            if !directory.starts_with(root) {
                break;
            }
            if let Some(entry) = entry_for_path(directory) {
                entries.entry(entry.path.clone()).or_insert(entry);
            }
            if directory == root {
                break;
            }
            ancestor = directory.parent();
        }
    }

    Ok(entries.into_values().collect())
}

fn direct_path_candidates(
    query: &str,
    root: &Path,
    options: &FileIndexOptions,
) -> (Vec<FileIndexEntry>, String) {
    let candidate = Path::new(query);
    let resolved = if query.is_empty() {
        root.to_path_buf()
    } else if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };
    let (directory, fragment) = if resolved.is_dir() {
        (resolved, String::new())
    } else {
        (
            resolved
                .parent()
                .filter(|parent| parent.is_dir())
                .unwrap_or(root)
                .to_path_buf(),
            resolved
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
        )
    };
    let extensions = normalized_extensions(options);
    let Ok(children) = fs::read_dir(&directory) else {
        return (Vec::new(), fragment);
    };
    let entries = children
        .filter_map(Result::ok)
        .filter_map(|child| {
            let path = child.path();
            if !options.include_hidden && is_hidden(&path) {
                return None;
            }
            let entry = entry_for_path(&path)?;
            if entry.kind == FileIndexEntryKind::File && !is_supported_file(&path, &extensions) {
                return None;
            }
            Some(entry)
        })
        .collect();
    (entries, fragment)
}

fn start_watcher(inner: &Arc<FileSearchIndexInner>) {
    let weak = Arc::downgrade(inner);
    let root = inner.root.clone();
    let options = inner.options.clone();
    thread::spawn(move || {
        let watcher_config = build_config(&options, &[]);
        let watcher = match fsindex::FileWatcher::new(&root, watcher_config) {
            Ok(watcher) => watcher,
            Err(_) => return,
        };
        while let Some(inner) = weak.upgrade() {
            if inner.stopped.load(Ordering::Acquire) {
                break;
            }
            let Some(event) = watcher.next_timeout(Duration::from_millis(500)) else {
                continue;
            };
            let Ok(event) = event else {
                continue;
            };
            if event.kind == EventKind::Accessed {
                continue;
            }
            thread::sleep(Duration::from_millis(180));
            if let Ok(entries) = build_entries(&root, &options) {
                if let Ok(mut current) = inner.entries.write() {
                    *current = entries;
                }
            }
        }
    });
}
