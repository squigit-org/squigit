// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{Result, StorageError};

use super::{ProjectMetadata, ThreadMetadata, ThreadStorage};

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct ThreadIndex {
    pub(super) projects: Vec<ProjectMetadata>,
}

impl ThreadIndex {
    fn with_device_project() -> Self {
        Self {
            projects: vec![ProjectMetadata::device_default()],
        }
    }
}

fn canonical_project_path(path: &Path) -> Result<std::path::PathBuf> {
    if !path.is_dir() {
        return Err(StorageError::InvalidProjectPath(path.display().to_string()));
    }

    let canonical = fs::canonicalize(path)?;
    if canonical.parent().is_none() {
        return Err(StorageError::InvalidProjectPath(path.display().to_string()));
    }

    if dirs::home_dir()
        .and_then(|home| fs::canonicalize(home).ok())
        .is_some_and(|home| home == canonical)
    {
        return Err(StorageError::InvalidProjectPath(path.display().to_string()));
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
            return Err(StorageError::InvalidProjectPath(path.display().to_string()));
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
            return Err(StorageError::InvalidProjectPath(path.display().to_string()));
        }
    }

    Ok(canonical)
}

impl ThreadStorage {
    pub(super) fn read_index(&self) -> Result<ThreadIndex> {
        if !self.index_path.exists() {
            let index = ThreadIndex::with_device_project();
            self.write_index(&index)?;
            return Ok(index);
        }

        let index_json = fs::read_to_string(&self.index_path)?;
        let mut index = serde_json::from_str::<ThreadIndex>(&index_json)?;
        if index.projects.is_empty() {
            index.projects.push(ProjectMetadata::device_default());
            self.write_index(&index)?;
        }
        Ok(index)
    }

    fn write_index(&self, index: &ThreadIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)?;
        fs::write(&self.index_path, json)?;
        Ok(())
    }

    pub fn create_project(&self, path: &str) -> Result<ProjectMetadata> {
        let requested_path = Path::new(path);
        let canonical = canonical_project_path(requested_path)?;
        let canonical_text = canonical.to_string_lossy().into_owned();
        let name = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| StorageError::InvalidProjectPath(path.to_string()))?
            .to_string();

        let mut index = self.read_index()?;
        let duplicate = index.projects.iter().any(|project| {
            project.path.as_deref().is_some_and(|registered| {
                fs::canonicalize(registered)
                    .map(|registered| registered == canonical)
                    .unwrap_or(false)
            })
        });
        if duplicate {
            return Err(StorageError::ProjectPathAlreadyExists(canonical_text));
        }

        let project = ProjectMetadata::new(name, Some(canonical_text));
        index.projects.insert(0, project.clone());
        self.write_index(&index)?;
        Ok(project)
    }

    pub(super) fn get_index_metadata(&self, thread_id: &str) -> Result<ThreadMetadata> {
        self.read_index()?
            .projects
            .into_iter()
            .find_map(|project| project.threads.get(thread_id).cloned())
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub(super) fn get_thread_project_id(&self, thread_id: &str) -> Result<String> {
        self.read_index()?
            .projects
            .into_iter()
            .find(|project| project.threads.contains_key(thread_id))
            .map(|project| project.id)
            .ok_or_else(|| StorageError::ThreadNotFound(thread_id.to_string()))
    }

    pub(super) fn update_index(&self, metadata: &ThreadMetadata) -> Result<()> {
        let mut index = self.read_index()?;

        if let Some(project) = index
            .projects
            .iter_mut()
            .find(|project| project.threads.contains_key(&metadata.id))
        {
            project
                .threads
                .insert(metadata.id.clone(), metadata.clone());
        } else {
            let project_index = index
                .projects
                .iter()
                .position(|project| project.path.is_none())
                .unwrap_or(0);
            let project = index
                .projects
                .get_mut(project_index)
                .ok_or_else(|| StorageError::ProjectNotFound("default".to_string()))?;
            project
                .threads
                .insert(metadata.id.clone(), metadata.clone());
        }

        self.write_index(&index)
    }

    pub(super) fn update_index_in_project(
        &self,
        metadata: &ThreadMetadata,
        project_id: &str,
    ) -> Result<()> {
        let mut index = self.read_index()?;
        for project in &mut index.projects {
            project.threads.remove(&metadata.id);
        }

        let project = index
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| StorageError::ProjectNotFound(project_id.to_string()))?;
        project
            .threads
            .insert(metadata.id.clone(), metadata.clone());
        self.write_index(&index)
    }

    pub(super) fn remove_from_index(&self, thread_id: &str) -> Result<()> {
        let mut index = self.read_index()?;
        for project in &mut index.projects {
            project.threads.remove(thread_id);
        }
        self.write_index(&index)
    }
}
