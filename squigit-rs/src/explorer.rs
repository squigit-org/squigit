// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::storage::{
    OcrAnnotationEntry, SideChatMetadata, ThreadMetadata, ThreadStorage, WorkspaceMetadata,
};
use chrono::Utc;
use regex::{Regex, RegexBuilder};
use std::cmp::Ordering;
use std::collections::HashSet;

use crate::services::brain;
use crate::{settings, thread};

pub type ExplorerResult<T> = std::result::Result<T, String>;

#[derive(Clone)]
pub struct ExplorerThread {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub image_hash: String,
    pub pinned_at: Option<String>,
    pub workspace_id: Option<String>,
}

impl From<ThreadMetadata> for ExplorerThread {
    fn from(thread: ThreadMetadata) -> Self {
        Self {
            id: thread.id,
            title: thread.title,
            created_at: thread.created_at.to_rfc3339(),
            updated_at: thread.updated_at.to_rfc3339(),
            image_hash: thread.image_hash,
            pinned_at: thread.pinned_at.map(|value| value.to_rfc3339()),
            workspace_id: None,
        }
    }
}

pub struct ExplorerWorkspace {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub directories: Vec<String>,
    pub total_thread_count: u32,
    pub threads: Vec<ExplorerThread>,
}

impl From<WorkspaceMetadata> for ExplorerWorkspace {
    fn from(workspace: WorkspaceMetadata) -> Self {
        Self {
            id: workspace.id.clone(),
            name: workspace.name,
            created_at: workspace.created_at.to_rfc3339(),
            directories: workspace.directories,
            total_thread_count: workspace.threads.len().min(u32::MAX as usize) as u32,
            threads: workspace
                .threads
                .into_values()
                .map(|thread| ExplorerThread {
                    workspace_id: Some(workspace.id.clone()),
                    ..thread.into()
                })
                .collect(),
        }
    }
}

pub struct UnassignedThreadsPage {
    pub threads: Vec<ExplorerThread>,
    pub total: u32,
}

pub struct ExplorerSideChatThread {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SideChatMetadata> for ExplorerSideChatThread {
    fn from(sidechat: SideChatMetadata) -> Self {
        Self {
            id: sidechat.id,
            title: sidechat.title,
            created_at: sidechat.created_at.to_rfc3339(),
            updated_at: sidechat.updated_at.to_rfc3339(),
        }
    }
}

pub struct ExplorerJobSnapshot {
    pub job_id: String,
    pub thread_id: String,
    pub kind: String,
    pub status: String,
}

pub struct ThreadSearchResult {
    pub thread_id: String,
    pub thread_title: String,
    pub thread_created_at: String,
    pub thread_updated_at: String,
    pub workspace_title: Option<String>,
    pub result_kind: String,
    pub result_index: u32,
    pub snippet: String,
    pub score: u32,
}

fn active_storage() -> ExplorerResult<ThreadStorage> {
    ThreadStorage::new().map_err(|error| error.to_string())
}

#[derive(Clone, Copy)]
enum ThreadOrdering {
    Created,
    Updated,
}

impl ThreadOrdering {
    fn parse(value: &str) -> ExplorerResult<Self> {
        match value {
            "created" => Ok(Self::Created),
            "updated" => Ok(Self::Updated),
            _ => Err(format!("Unsupported thread ordering: {value}")),
        }
    }
}

#[derive(Clone, Copy)]
enum WorkspaceOrdering {
    Created,
    Updated,
}

impl WorkspaceOrdering {
    fn parse(value: &str) -> ExplorerResult<Self> {
        match value {
            "created" => Ok(Self::Created),
            "updated" => Ok(Self::Updated),
            _ => Err(format!("Unsupported workspace ordering: {value}")),
        }
    }
}

fn compare_threads(
    left: &ThreadMetadata,
    right: &ThreadMetadata,
    ordering: ThreadOrdering,
) -> Ordering {
    match (&left.pinned_at, &right.pinned_at) {
        (Some(left_pinned), Some(right_pinned)) => right_pinned.cmp(left_pinned),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => match ordering {
            ThreadOrdering::Created => right.created_at.cmp(&left.created_at),
            ThreadOrdering::Updated => right.updated_at.cmp(&left.updated_at),
        },
    }
}

fn sort_threads(mut threads: Vec<ThreadMetadata>, ordering: ThreadOrdering) -> Vec<ThreadMetadata> {
    threads.sort_by(|left, right| compare_threads(left, right, ordering));
    threads
}

fn latest_workspace_activity(workspace: &WorkspaceMetadata) -> Option<chrono::DateTime<Utc>> {
    workspace
        .threads
        .values()
        .map(|thread| &thread.updated_at)
        .max()
        .cloned()
}

pub fn list_workspaces(
    workspace_ordering: String,
    thread_ordering: String,
) -> ExplorerResult<Vec<ExplorerWorkspace>> {
    let workspace_ordering = WorkspaceOrdering::parse(&workspace_ordering)?;
    let thread_ordering = ThreadOrdering::parse(&thread_ordering)?;
    let mut workspaces = active_storage()?
        .list_workspaces()
        .map_err(|error| error.to_string())?;
    workspaces.sort_by(|left, right| match workspace_ordering {
        WorkspaceOrdering::Created => right.created_at.cmp(&left.created_at),
        WorkspaceOrdering::Updated => latest_workspace_activity(right)
            .unwrap_or(right.created_at)
            .cmp(&latest_workspace_activity(left).unwrap_or(left.created_at)),
    });
    Ok(workspaces
        .into_iter()
        .map(|workspace| {
            let threads = sort_threads(
                workspace.threads.values().cloned().collect(),
                thread_ordering,
            )
            .into_iter()
            .map(|thread| ExplorerThread {
                workspace_id: Some(workspace.id.clone()),
                ..thread.into()
            })
            .collect();
            ExplorerWorkspace {
                threads,
                ..workspace.into()
            }
        })
        .collect())
}

pub fn list_unassigned_threads(
    offset: u32,
    limit: u32,
    thread_ordering: String,
) -> ExplorerResult<UnassignedThreadsPage> {
    let ordering = ThreadOrdering::parse(&thread_ordering)?;
    let threads = active_storage()?
        .list_unassigned_threads()
        .map_err(|error| error.to_string())?;
    let total = threads.len().min(u32::MAX as usize) as u32;
    let threads = sort_threads(threads, ordering)
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .map(Into::into)
        .collect();
    Ok(UnassignedThreadsPage { threads, total })
}

pub fn list_sidechat_threads() -> ExplorerResult<Vec<ExplorerSideChatThread>> {
    let mut sidechats = active_storage()?
        .list_sidechat_threads()
        .map_err(|error| error.to_string())?;
    sidechats.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(sidechats.into_iter().map(Into::into).collect())
}

pub fn group_threads(first_id: String, second_id: String) -> ExplorerResult<ExplorerWorkspace> {
    active_storage()?
        .group_threads(&first_id, &second_id)
        .map(Into::into)
        .map_err(|error| error.to_string())
}

pub fn create_workspace(
    name: String,
    directories: Vec<String>,
) -> ExplorerResult<ExplorerWorkspace> {
    active_storage()?
        .create_workspace(&name, &directories)
        .map(Into::into)
        .map_err(|error| error.to_string())
}

pub fn update_workspace(
    workspace_id: String,
    name: String,
    directories: Vec<String>,
) -> ExplorerResult<ExplorerWorkspace> {
    active_storage()?
        .update_workspace(&workspace_id, &name, &directories)
        .map(Into::into)
        .map_err(|error| error.to_string())
}

pub fn delete_workspace(workspace_id: String) -> ExplorerResult<()> {
    active_storage()?
        .delete_workspace(&workspace_id)
        .map_err(|error| error.to_string())
}

pub fn set_thread_workspace(thread_id: String, workspace_id: Option<String>) -> ExplorerResult<()> {
    active_storage()?
        .set_thread_workspace(&thread_id, workspace_id.as_deref())
        .map_err(|error| error.to_string())
}

pub fn rename_thread(thread_id: String, title: String) -> ExplorerResult<ExplorerThread> {
    let storage = active_storage()?;
    let mut metadata = storage
        .load_thread(&thread_id)
        .map_err(|error| error.to_string())?
        .metadata;
    metadata.title = title;
    storage
        .update_thread_metadata(&metadata)
        .map_err(|error| error.to_string())?;
    let workspace_id = storage
        .get_thread_workspace_id(&metadata.id)
        .map_err(|error| error.to_string())?;
    Ok(ExplorerThread {
        workspace_id,
        ..metadata.into()
    })
}

pub fn toggle_pin_thread(thread_id: String) -> ExplorerResult<ExplorerThread> {
    let storage = active_storage()?;
    let mut metadata = storage
        .load_thread(&thread_id)
        .map_err(|error| error.to_string())?
        .metadata;
    metadata.pinned_at = metadata.pinned_at.is_none().then(Utc::now);
    storage
        .update_thread_metadata(&metadata)
        .map_err(|error| error.to_string())?;
    let workspace_id = storage
        .get_thread_workspace_id(&metadata.id)
        .map_err(|error| error.to_string())?;
    Ok(ExplorerThread {
        workspace_id,
        ..metadata.into()
    })
}

pub fn delete_thread(thread_id: String) -> ExplorerResult<()> {
    active_storage()?
        .delete_thread(&thread_id)
        .map_err(|error| error.to_string())
}

pub fn delete_threads(thread_ids: Vec<String>) -> ExplorerResult<()> {
    active_storage()?
        .delete_threads(&thread_ids)
        .map_err(|error| error.to_string())
}

pub fn fork_thread(thread_id: String) -> ExplorerResult<Option<ExplorerThread>> {
    let storage = active_storage()?;
    let metadata = storage
        .fork_thread_latest(&thread_id)
        .map_err(|error| error.to_string())?;
    let workspace_id = storage
        .get_thread_workspace_id(&metadata.id)
        .map_err(|error| error.to_string())?;
    Ok(Some(ExplorerThread {
        workspace_id,
        ..metadata.into()
    }))
}

enum SearchPlan {
    Regex(Option<Regex>),
    Tokens(Vec<String>),
    Literal(String),
}

fn search_plan(query: &str) -> SearchPlan {
    let regex_source = query.strip_prefix("re:").map(str::to_string).or_else(|| {
        (query.starts_with('/') && query.ends_with('/') && query.len() > 2)
            .then(|| query[1..query.len() - 1].to_string())
    });
    if let Some(source) = regex_source {
        return SearchPlan::Regex(
            RegexBuilder::new(&source)
                .case_insensitive(true)
                .build()
                .ok(),
        );
    }

    let mut seen = HashSet::new();
    let mut tokens = query
        .split_whitespace()
        .map(|part| part.trim_start_matches(|character| character == '-' || character == '+'))
        .map(|part| {
            part.to_lowercase()
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .collect::<String>()
        })
        .filter(|part| part.len() >= 2)
        .filter(|part| seen.insert(part.clone()))
        .collect::<Vec<_>>();
    tokens.sort_by_key(|right| std::cmp::Reverse(right.len()));
    tokens.truncate(8);
    if tokens.is_empty() {
        SearchPlan::Literal(query.to_lowercase())
    } else {
        SearchPlan::Tokens(tokens)
    }
}

fn matching_index(content: &str, plan: &SearchPlan) -> Option<(usize, u32)> {
    match plan {
        SearchPlan::Regex(regex) => regex
            .as_ref()
            .and_then(|regex| regex.find(content))
            .map(|matched| (matched.start(), 100)),
        SearchPlan::Tokens(tokens) => {
            let lower = content.to_lowercase();
            let mut first = None;
            for token in tokens {
                let index = lower.find(token)?;
                first.get_or_insert(index);
            }
            first.map(|index| (index, tokens.len() as u32 * 10))
        }
        SearchPlan::Literal(query) => content.to_lowercase().find(query).map(|index| (index, 50)),
    }
}

fn char_boundary_at_or_before(value: &str, mut index: usize) -> usize {
    index = index.min(value.len());
    while !value.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn snippet(content: &str, match_index: usize, query_length: usize) -> String {
    let start = char_boundary_at_or_before(content, match_index.saturating_sub(40));
    let end = char_boundary_at_or_before(
        content,
        match_index
            .saturating_add(query_length)
            .saturating_add(40)
            .min(content.len()),
    );
    let mut value = content[start..end].replace('\n', " ");
    if start > 0 {
        value.insert_str(0, "...");
    }
    if end < content.len() {
        value.push_str("...");
    }
    value
}

fn push_search_result(
    results: &mut Vec<ThreadSearchResult>,
    workspace: Option<&WorkspaceMetadata>,
    thread: &ThreadMetadata,
    result_kind: &str,
    result_index: usize,
    content: &str,
    plan: &SearchPlan,
    query_length: usize,
    score_bonus: u32,
) {
    let Some((match_index, score)) = matching_index(content, plan) else {
        return;
    };
    results.push(ThreadSearchResult {
        thread_id: thread.id.clone(),
        thread_title: thread.title.clone(),
        thread_created_at: thread.created_at.to_rfc3339(),
        thread_updated_at: thread.updated_at.to_rfc3339(),
        workspace_title: workspace.map(|workspace| workspace.name.clone()),
        result_kind: result_kind.to_string(),
        result_index: result_index.min(u32::MAX as usize) as u32,
        snippet: snippet(content, match_index, query_length),
        score: score.saturating_add(score_bonus),
    });
}

pub fn search_threads(query: String, limit: u32) -> ExplorerResult<Vec<ThreadSearchResult>> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let storage = active_storage()?;
    let plan = search_plan(&query);
    let mut results = Vec::new();
    let workspaces = storage
        .list_workspaces()
        .map_err(|error| error.to_string())?;
    let unassigned = storage
        .list_unassigned_threads()
        .map_err(|error| error.to_string())?;
    let entries = workspaces
        .iter()
        .flat_map(|workspace| {
            workspace
                .threads
                .values()
                .map(move |thread| (Some(workspace), thread))
        })
        .chain(unassigned.iter().map(|thread| (None, thread)));
    for (workspace, thread) in entries {
        push_search_result(
            &mut results,
            workspace,
            thread,
            "title",
            0,
            &thread.title,
            &plan,
            query.len(),
            60,
        );
        let messages = match storage.load_messages(&thread.id) {
            Ok(messages) => messages,
            Err(_) => continue,
        };
        for (message_index, message) in messages.iter().enumerate() {
            push_search_result(
                &mut results,
                workspace,
                thread,
                "message",
                message_index,
                message.content(),
                &plan,
                query.len(),
                20,
            );
        }
        if let Ok(annotations) = storage.get_ocr_annotations(&thread.id) {
            let mut ocr_index = 0;
            for annotation in annotations.into_values() {
                let regions = match annotation {
                    OcrAnnotationEntry::EmptyState(regions) => regions,
                    OcrAnnotationEntry::Model(model) => model.ocr_data,
                };
                for region in regions {
                    push_search_result(
                        &mut results,
                        workspace,
                        thread,
                        "ocr",
                        ocr_index,
                        &region.text,
                        &plan,
                        query.len(),
                        10,
                    );
                    ocr_index += 1;
                }
            }
        }
    }
    results.sort_by(|left, right| {
        right.score.cmp(&left.score).then_with(|| {
            let left_time = left.thread_updated_at.parse::<chrono::DateTime<Utc>>().ok();
            let right_time = right
                .thread_updated_at
                .parse::<chrono::DateTime<Utc>>()
                .ok();
            right_time.cmp(&left_time)
        })
    });
    results.truncate(limit as usize);
    Ok(results)
}

pub async fn suggest_thread_title(thread_id: String) -> ExplorerResult<String> {
    let config = tokio::task::spawn_blocking(settings::load_config)
        .await
        .map_err(|error| format!("Settings load task failed: {error}"))??;
    let candidates = brain()
        .build_model_attempt_plan(config.model, config.effort)
        .await?;
    let title = brain()
        .suggest_thread_title(thread_id.clone(), candidates)
        .await?;
    let persisted_title = title.clone();
    tokio::task::spawn_blocking(move || {
        let storage = active_storage()?;
        let mut metadata = storage
            .load_thread(&thread_id)
            .map_err(|error| error.to_string())?
            .metadata;
        metadata.title = persisted_title;
        storage
            .update_thread_metadata(&metadata)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(title)
}

pub fn get_jobs_snapshot() -> ExplorerResult<Vec<ExplorerJobSnapshot>> {
    let brain_jobs = thread::get_thread_jobs_snapshot()?;
    let ocr_jobs = thread::ocr::get_ocr_jobs_snapshot()?;
    Ok(brain_jobs
        .into_iter()
        .map(|job| ExplorerJobSnapshot {
            job_id: job.job_id,
            thread_id: job.thread_id,
            kind: "brain".to_string(),
            status: job.status,
        })
        .chain(ocr_jobs.into_iter().map(|job| ExplorerJobSnapshot {
            job_id: job.job_id,
            thread_id: job.thread_id,
            kind: "ocr".to_string(),
            status: job.status,
        }))
        .collect())
}

