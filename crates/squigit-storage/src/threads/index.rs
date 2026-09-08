// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{Result, StorageError};

use super::{ThreadMetadata, ThreadStorage, WorkspaceMetadata};

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct ThreadIndex {
    pub(super) workspaces: Vec<WorkspaceMetadata>,
}

impl ThreadIndex {
    fn with_recents_workspace() -> Self {
        Self {
            workspaces: vec![WorkspaceMetadata::recents_default()],
        }
    }
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
            let index = ThreadIndex::with_recents_workspace();
            self.write_index(&index)?;
            return Ok(index);
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
        if directories.is_empty() {
            return Err(StorageError::InvalidWorkspacePath(String::new()));
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
        let mut index = self.read_index()?;
        let recents_index = index
            .workspaces
            .iter()
            .position(|item| item.is_recents)
            .unwrap_or(index.workspaces.len());
        index.workspaces.insert(recents_index, workspace.clone());
        self.write_index(&index)?;
        Ok(workspace)
    }

    pub fn create_empty_workspace(&self, name: &str) -> Result<WorkspaceMetadata> {
        let name = name.trim();
        if name.is_empty() {
            return Err(StorageError::InvalidWorkspaceName);
        }
        let workspace = WorkspaceMetadata::new(name.to_string(), Vec::new());
        let mut index = self.read_index()?;
        let recents_index = index
            .workspaces
            .iter()
            .position(|item| item.is_recents)
            .unwrap_or(index.workspaces.len());
        index.workspaces.insert(recents_index, workspace.clone());
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
        let mut index = self.read_index()?;
        let workspace = index
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.id == workspace_id)
            .ok_or_else(|| StorageError::WorkspaceNotFound(workspace_id.to_string()))?;
        if workspace.is_recents {
            return Err(StorageError::CannotModifyRecentsWorkspace);
        }
        let directories = if directories.is_empty() && workspace.directories.is_empty() {
            Vec::new()
        } else {
            Self::validate_workspace_input(name, directories)?.1
        };
        workspace.name = name.to_string();
        workspace.directories = directories;
        let updated = workspace.clone();
        self.write_index(&index)?;
        Ok(updated)
    }

    pub fn delete_workspace(&self, workspace_id: &str) -> Result<()> {
        let mut index = self.read_index()?;
        let workspace_index = index
            .workspaces
            .iter()
            .position(|workspace| workspace.id == workspace_id)
            .ok_or_else(|| StorageError::WorkspaceNotFound(workspace_id.to_string()))?;
        if index.workspaces[workspace_index].is_recents {
            return Err(StorageError::CannotModifyRecentsWorkspace);
        }
        let removed = index.workspaces.remove(workspace_index);
        let recents = index
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.is_recents)
            .ok_or_else(|| StorageError::WorkspaceNotFound("recents".to_string()))?;
        recents.threads.extend(removed.threads);
        self.write_index(&index)
    }

    pub(super) fn get_index_metadata(&self, thread_id: &str) -> Result<ThreadMetadata> {
        self.read_index()?
            .workspaces
            .into_iter()
            .find_map(|workspace| workspace.threads.get(thread_id).cloned())
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub(super) fn get_thread_workspace_id(&self, thread_id: &str) -> Result<String> {
        self.read_index()?
            .workspaces
            .into_iter()
            .find(|workspace| workspace.threads.contains_key(thread_id))
            .map(|workspace| workspace.id)
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub(super) fn update_index(&self, metadata: &ThreadMetadata) -> Result<()> {
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
            let workspace_index = index
                .workspaces
                .iter()
                .position(|workspace| workspace.is_recents)
                .ok_or_else(|| StorageError::WorkspaceNotFound("recents".to_string()))?;
            let workspace = index
                .workspaces
                .get_mut(workspace_index)
                .ok_or_else(|| StorageError::WorkspaceNotFound("default".to_string()))?;
            workspace
                .threads
                .insert(metadata.id.clone(), metadata.clone());
        }

        self.write_index(&index)
    }

    pub(super) fn update_index_in_workspace(
        &self,
        metadata: &ThreadMetadata,
        workspace_id: &str,
    ) -> Result<()> {
        let mut index = self.read_index()?;
        for workspace in &mut index.workspaces {
            workspace.threads.remove(&metadata.id);
        }

        let workspace = index
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.id == workspace_id)
            .ok_or_else(|| StorageError::WorkspaceNotFound(workspace_id.to_string()))?;
        workspace
            .threads
            .insert(metadata.id.clone(), metadata.clone());
        self.write_index(&index)
    }

    pub(super) fn remove_many_from_index(&self, thread_ids: &[String]) -> Result<()> {
        let removed = thread_ids
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();
        let mut index = self.read_index()?;
        for workspace in &mut index.workspaces {
            workspace
                .threads
                .retain(|thread_id, _| !removed.contains(thread_id.as_str()));
        }
        self.write_index(&index)
    }
}
