// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

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
    fn with_device_workspace() -> Self {
        Self {
            workspaces: vec![WorkspaceMetadata::device_default()],
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
            let index = ThreadIndex::with_device_workspace();
            self.write_index(&index)?;
            return Ok(index);
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        let mut index = serde_json::from_str::<ThreadIndex>(&index_json)?;
        let mut changed = false;
        if !index
            .workspaces
            .iter()
            .any(|workspace| workspace.path.is_none())
        {
            index.workspaces.push(WorkspaceMetadata::device_default());
            changed = true;
        }
        if let Some(default_index) = index
            .workspaces
            .iter()
            .position(|workspace| workspace.path.is_none())
        {
            if default_index + 1 != index.workspaces.len() {
                let default_workspace = index.workspaces.remove(default_index);
                index.workspaces.push(default_workspace);
                changed = true;
            }
        }
        if changed {
            self.write_index(&index)?;
        }
        Ok(index)
    }

    fn write_index(&self, index: &ThreadIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)?;
        super::atomic_write(&self.index_path, json.as_bytes())
    }

    pub fn create_workspace(&self, path: &str) -> Result<WorkspaceMetadata> {
        let requested_path = Path::new(path);
        let canonical = canonical_workspace_path(requested_path)?;
        let canonical_text = canonical.to_string_lossy().into_owned();
        let name = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| StorageError::InvalidWorkspacePath(path.to_string()))?
            .to_string();

        let mut index = self.read_index()?;
        let duplicate = index.workspaces.iter().any(|workspace| {
            workspace.path.as_deref().is_some_and(|registered| {
                fs::canonicalize(registered)
                    .map(|registered| registered == canonical)
                    .unwrap_or(false)
            })
        });
        if duplicate {
            return Err(StorageError::WorkspacePathAlreadyExists(canonical_text));
        }

        let workspace = WorkspaceMetadata::new(name, Some(canonical_text));
        index.workspaces.insert(0, workspace.clone());
        self.write_index(&index)?;
        Ok(workspace)
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
                .position(|workspace| workspace.path.is_none())
                .ok_or_else(|| StorageError::WorkspaceNotFound("default".to_string()))?;
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

    pub(super) fn remove_from_index(&self, thread_id: &str) -> Result<()> {
        let mut index = self.read_index()?;
        for workspace in &mut index.workspaces {
            workspace.threads.remove(thread_id);
        }
        self.write_index(&index)
    }
}
