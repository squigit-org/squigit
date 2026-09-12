// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

// Serialize catalog read/modify/write operations across addon worker threads.
static CATALOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

use serde::{Deserialize, Serialize};

use crate::error::{Result, StorageError};

use super::{SideChatMetadata, ThreadMetadata, ThreadStorage, WorkspaceMetadata};

#[derive(Debug, Default, Serialize, Deserialize)]
pub(super) struct ThreadIndex {
    pub(super) workspaces: Vec<WorkspaceMetadata>,
    pub(super) unassigned_threads: BTreeMap<String, ThreadMetadata>,
    #[serde(default)]
    pub(super) sidechat_threads: BTreeMap<String, SideChatMetadata>,
}

fn canonical_workspace_path(path: &Path) -> Result<std::path::PathBuf> {
    if !path.is_dir() {
        return Err(StorageError::InvalidWorkspacePath(
            path.display().to_string(),
        ));
    }

    let canonical = fs::canonicalize(path)?;
    if canonical.parent().is_none() {
        return Err(StorageError::InvalidWorkspacePath(
            path.display().to_string(),
        ));
    }

    if dirs::home_dir()
        .and_then(|home| fs::canonicalize(home).ok())
        .is_some_and(|home| home == canonical)
    {
        return Err(StorageError::InvalidWorkspacePath(
            path.display().to_string(),
        ));
    }

    #[cfg(unix)]
    {
        const PROTECTED_PATHS: &[&str] = &[
            "/Applications",
            "/Library",
            "/System",
            "/Users",
            "/Volumes",
            "/bin",
            "/boot",
            "/dev",
            "/etc",
            "/home",
            "/lib",
            "/lib64",
            "/opt",
            "/proc",
            "/root",
            "/run",
            "/sbin",
            "/sys",
            "/usr",
            "/var",
        ];

        if PROTECTED_PATHS
            .iter()
            .any(|protected| canonical == Path::new(protected))
        {
            return Err(StorageError::InvalidWorkspacePath(
                path.display().to_string(),
            ));
        }
    }

    #[cfg(windows)]
    {
        let normalized = canonical
            .to_string_lossy()
            .replace('/', "\\")
            .to_lowercase();
        let drive_relative = normalized
            .strip_prefix(r"\\?\")
            .unwrap_or(normalized.as_str());
        let components = drive_relative
            .split('\\')
            .filter(|component| !component.is_empty())
            .collect::<Vec<_>>();
        let protected = [
            "program files",
            "program files (x86)",
            "programdata",
            "users",
            "windows",
        ];

        if components.len() <= 1
            || components
                .get(1)
                .is_some_and(|component| protected.contains(component))
        {
            return Err(StorageError::InvalidWorkspacePath(
                path.display().to_string(),
            ));
        }
    }

    Ok(canonical)
}

impl ThreadStorage {
    pub(super) fn read_index(&self) -> Result<ThreadIndex> {
        if !self.index_path.exists() {
            return Ok(ThreadIndex::default());
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        serde_json::from_str::<ThreadIndex>(&index_json).map_err(Into::into)
    }

    fn write_index(&self, index: &ThreadIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)?;
        super::atomic_write(&self.index_path, json.as_bytes())
    }

    fn validate_workspace_input(
        name: &str,
        directories: &[String],
    ) -> Result<(String, Vec<String>)> {
        let name = name.trim();
        if name.is_empty() {
            return Err(StorageError::InvalidWorkspaceName);
        }
        let directories = directories
            .iter()
            .map(|path| canonical_workspace_path(Path::new(path)))
            .collect::<Result<Vec<_>>>()?;
        Ok((
            name.to_string(),
            directories
                .into_iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
        ))
    }

    pub fn create_workspace(
        &self,
        name: &str,
        directories: &[String],
    ) -> Result<WorkspaceMetadata> {
        let (name, directories) = Self::validate_workspace_input(name, directories)?;
        let workspace = WorkspaceMetadata::new(name, directories);
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        index.workspaces.push(workspace.clone());
        self.write_index(&index)?;
        Ok(workspace)
    }

    pub fn update_workspace(
        &self,
        workspace_id: &str,
        name: &str,
        directories: &[String],
    ) -> Result<WorkspaceMetadata> {
        let name = name.trim();
        if name.is_empty() {
            return Err(StorageError::InvalidWorkspaceName);
        }
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        let workspace = index
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.id == workspace_id)
            .ok_or_else(|| StorageError::WorkspaceNotFound(workspace_id.to_string()))?;
        let directories = Self::validate_workspace_input(name, directories)?.1;
        workspace.name = name.to_string();
        workspace.directories = directories;
        let updated = workspace.clone();
        self.write_index(&index)?;
        Ok(updated)
    }

    pub fn delete_workspace(&self, workspace_id: &str) -> Result<()> {
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        let workspace_index = index
            .workspaces
            .iter()
            .position(|workspace| workspace.id == workspace_id)
            .ok_or_else(|| StorageError::WorkspaceNotFound(workspace_id.to_string()))?;
        let removed = index.workspaces.remove(workspace_index);
        index.unassigned_threads.extend(removed.threads);
        self.write_index(&index)
    }

    pub(super) fn get_index_metadata(&self, thread_id: &str) -> Result<ThreadMetadata> {
        let index = self.read_index()?;
        index
            .unassigned_threads
            .get(thread_id)
            .cloned()
            .or_else(|| {
                index
                    .workspaces
                    .iter()
                    .find_map(|workspace| workspace.threads.get(thread_id).cloned())
            })
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub fn get_thread_workspace_id(&self, thread_id: &str) -> Result<Option<String>> {
        let index = self.read_index()?;
        if index.unassigned_threads.contains_key(thread_id) {
            return Ok(None);
        }
        index
            .workspaces
            .iter()
            .find(|workspace| workspace.threads.contains_key(thread_id))
            .map(|workspace| Some(workspace.id.clone()))
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub(super) fn update_index(&self, metadata: &ThreadMetadata) -> Result<()> {
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        if let Some(workspace) = index
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.threads.contains_key(&metadata.id))
        {
            workspace
                .threads
                .insert(metadata.id.clone(), metadata.clone());
        } else {
            index
                .unassigned_threads
                .insert(metadata.id.clone(), metadata.clone());
        }
        self.write_index(&index)
    }

    pub(super) fn get_sidechat_metadata(&self, sidechat_id: &str) -> Result<SideChatMetadata> {
        self.read_index()?
            .sidechat_threads
            .get(sidechat_id)
            .cloned()
            .ok_or_else(|| StorageError::ThreadNotFound(sidechat_id.to_string()))
    }

    pub(super) fn update_sidechat_index(&self, metadata: &SideChatMetadata) -> Result<()> {
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        index
            .sidechat_threads
            .insert(metadata.id.clone(), metadata.clone());
        self.write_index(&index)
    }

    pub fn list_sidechat_threads(&self) -> Result<Vec<SideChatMetadata>> {
        Ok(self.read_index()?.sidechat_threads.into_values().collect())
    }

    pub(super) fn update_index_in_workspace(
        &self,
        metadata: &ThreadMetadata,
        workspace_id: Option<&str>,
    ) -> Result<()> {
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        if let Some(id) = workspace_id {
            if !index.workspaces.iter().any(|workspace| workspace.id == id) {
                return Err(StorageError::WorkspaceNotFound(id.to_string()));
            }
        }
        let metadata = index
            .unassigned_threads
            .get(&metadata.id)
            .or_else(|| {
                index
                    .workspaces
                    .iter()
                    .find_map(|workspace| workspace.threads.get(&metadata.id))
            })
            .cloned()
            .unwrap_or_else(|| metadata.clone());
        index.unassigned_threads.remove(&metadata.id);
        for workspace in &mut index.workspaces {
            workspace.threads.remove(&metadata.id);
        }
        if let Some(id) = workspace_id {
            let workspace = index
                .workspaces
                .iter_mut()
                .find(|workspace| workspace.id == id)
                .unwrap();
            workspace
                .threads
                .insert(metadata.id.clone(), metadata.clone());
        } else {
            index
                .unassigned_threads
                .insert(metadata.id.clone(), metadata.clone());
        }
        self.write_index(&index)
    }

    /// Group two unassigned threads in one catalog write.
    pub fn group_threads(&self, first_id: &str, second_id: &str) -> Result<WorkspaceMetadata> {
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        if first_id == second_id
            || !index.unassigned_threads.contains_key(first_id)
            || !index.unassigned_threads.contains_key(second_id)
        {
            return Err(StorageError::ThreadNotFound(second_id.to_string()));
        }
        let mut workspace = WorkspaceMetadata::new("New workspace".to_string(), Vec::new());
        for id in [first_id, second_id] {
            workspace
                .threads
                .insert(id.to_string(), index.unassigned_threads.remove(id).unwrap());
        }
        index.workspaces.push(workspace.clone());
        self.write_index(&index)?;
        Ok(workspace)
    }

    pub fn list_unassigned_threads(&self) -> Result<Vec<ThreadMetadata>> {
        Ok(self
            .read_index()?
            .unassigned_threads
            .into_values()
            .collect())
    }

    pub(super) fn remove_many_from_index(&self, thread_ids: &[String]) -> Result<()> {
        let removed = thread_ids
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();
        let _guard = CATALOG_WRITE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = self.read_index()?;
        index
            .unassigned_threads
            .retain(|id, _| !removed.contains(id.as_str()));
        for workspace in &mut index.workspaces {
            workspace
                .threads
                .retain(|id, _| !removed.contains(id.as_str()));
        }
        self.write_index(&index)
    }
}
