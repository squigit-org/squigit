// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::records::{self, SIDECHAT_COLUMNS, THREAD_COLUMNS};
use super::{SideChatMetadata, ThreadMetadata, ThreadStorage, WorkspaceMetadata};
use crate::{Result, StorageError};

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

pub(super) fn next_fork_version(
    connection: &Connection,
    kind: &str,
    family_id: &str,
    title: &str,
    source_version: u32,
) -> Result<(String, u32)> {
    if source_version == 1 {
        connection.execute("INSERT INTO fork_families (kind, id, base_title, last_version) VALUES (?1, ?2, ?3, 1) ON CONFLICT (kind, id) DO NOTHING", params![kind, family_id, title])?;
    }
    let (base_title, last_version): (String, u32) = connection
        .query_row(
            "SELECT base_title, last_version FROM fork_families WHERE kind = ?1 AND id = ?2",
            params![kind, family_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            StorageError::InvalidThreadMessage(format!("fork family `{family_id}` is missing"))
        })?;
    if last_version < source_version {
        return Err(StorageError::InvalidThreadMessage(format!(
            "fork family `{family_id}` is behind version `{source_version}`"
        )));
    }
    let version = last_version.checked_add(1).ok_or_else(|| {
        StorageError::InvalidThreadMessage(format!(
            "fork family `{family_id}` has no more available versions"
        ))
    })?;
    connection.execute(
        "UPDATE fork_families SET last_version = ?1 WHERE kind = ?2 AND id = ?3",
        params![version, kind, family_id],
    )?;
    Ok((base_title, version))
}

pub(super) fn set_workspace(
    connection: &Connection,
    thread_id: &str,
    workspace_id: Option<&str>,
) -> Result<()> {
    if let Some(id) = workspace_id {
        if !connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = ?1)",
            [id],
            |row| row.get::<_, bool>(0),
        )? {
            return Err(StorageError::WorkspaceNotFound(id.into()));
        }
    }
    connection.execute(
        "UPDATE conversations SET workspace_id = ?1 WHERE id = ?2 AND kind = 'thread'",
        params![workspace_id, thread_id],
    )?;
    Ok(())
}

pub(super) fn workspace_id(connection: &Connection, thread_id: &str) -> Result<Option<String>> {
    connection
        .query_row(
            "SELECT workspace_id FROM conversations WHERE id = ?1 AND kind = 'thread'",
            [thread_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| StorageError::ThreadNotFound(thread_id.into()))
}

fn put_directories(connection: &Connection, id: &str, directories: &[String]) -> Result<()> {
    connection.execute(
        "DELETE FROM workspace_directories WHERE workspace_id = ?1",
        [id],
    )?;
    for (position, path) in directories.iter().enumerate() {
        connection.execute(
            "INSERT INTO workspace_directories (workspace_id, position, path) VALUES (?1, ?2, ?3)",
            params![id, position as i64, path],
        )?;
    }
    Ok(())
}

fn put_workspace(connection: &Connection, workspace: &WorkspaceMetadata) -> Result<()> {
    connection.execute("INSERT INTO workspaces (id, name, created_at, position) VALUES (?1, ?2, ?3, (SELECT coalesce(max(position), -1) + 1 FROM workspaces))", params![workspace.id, workspace.name, workspace.created_at])?;
    put_directories(connection, &workspace.id, &workspace.directories)
}

fn get_workspace(connection: &Connection, id: &str) -> Result<WorkspaceMetadata> {
    let mut workspace = connection
        .query_row(
            "SELECT id, name, created_at FROM workspaces WHERE id = ?1",
            [id],
            |row| {
                Ok(WorkspaceMetadata {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    directories: Vec::new(),
                    threads: BTreeMap::new(),
                })
            },
        )
        .optional()?
        .ok_or_else(|| StorageError::WorkspaceNotFound(id.into()))?;
    let mut directories = connection.prepare(
        "SELECT path FROM workspace_directories WHERE workspace_id = ?1 ORDER BY position",
    )?;
    workspace.directories = directories
        .query_map([id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut threads = connection.prepare(&format!("SELECT {THREAD_COLUMNS} FROM conversations WHERE workspace_id = ?1 AND kind = 'thread' ORDER BY id"))?;
    for thread in threads.query_map([id], records::thread_metadata)? {
        let thread = thread?;
        workspace.threads.insert(thread.id.clone(), thread);
    }
    Ok(workspace)
}

impl ThreadStorage {
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
            name.into(),
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
        self.database.write(|connection| {
            put_workspace(connection, &workspace)?;
            Ok(workspace)
        })
    }

    pub fn update_workspace(
        &self,
        id: &str,
        name: &str,
        directories: &[String],
    ) -> Result<WorkspaceMetadata> {
        let name = name.trim();
        if name.is_empty() {
            return Err(StorageError::InvalidWorkspaceName);
        }
        self.database.write(|connection| {
            let mut workspace = get_workspace(connection, id)?;
            let directories = Self::validate_workspace_input(name, directories)?.1;
            workspace.name = name.into();
            workspace.directories = directories;
            connection.execute(
                "UPDATE workspaces SET name = ?1 WHERE id = ?2",
                params![name, id],
            )?;
            put_directories(connection, id, &workspace.directories)?;
            Ok(workspace)
        })
    }

    pub fn delete_workspace(&self, id: &str) -> Result<()> {
        self.database.write(|connection| {
            if connection.execute("DELETE FROM workspaces WHERE id = ?1", [id])? == 0 {
                return Err(StorageError::WorkspaceNotFound(id.into()));
            }
            Ok(())
        })
    }

    pub fn get_thread_workspace_id(&self, id: &str) -> Result<Option<String>> {
        self.database
            .read(|connection| workspace_id(connection, id))
    }

    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceMetadata>> {
        self.database.read(|connection| {
            let mut statement =
                connection.prepare("SELECT id FROM workspaces ORDER BY position")?;
            let ids = statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            ids.iter().map(|id| get_workspace(connection, id)).collect()
        })
    }

    pub fn list_sidechat_threads(&self) -> Result<Vec<SideChatMetadata>> {
        self.database.read(|connection| {
            let mut statement = connection.prepare(&format!(
                "SELECT {SIDECHAT_COLUMNS} FROM conversations WHERE kind = 'sidechat' ORDER BY id"
            ))?;
            let threads = statement
                .query_map([], records::sidechat_metadata)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(threads)
        })
    }

    pub fn list_threads(&self) -> Result<Vec<ThreadMetadata>> {
        self.database.read(|connection| {
            let mut statement = connection.prepare(&format!("SELECT {THREAD_COLUMNS} FROM conversations WHERE kind = 'thread' ORDER BY (workspace_id IS NULL), (SELECT position FROM workspaces WHERE id = workspace_id), id"))?;
            let mut threads = statement.query_map([], records::thread_metadata)?.collect::<rusqlite::Result<Vec<_>>>()?;
            threads.sort_by_key(|thread| std::cmp::Reverse(thread.updated_at));
            Ok(threads)
        })
    }

    pub fn list_unassigned_threads(&self) -> Result<Vec<ThreadMetadata>> {
        self.database.read(|connection| {
            let mut statement = connection.prepare(&format!("SELECT {THREAD_COLUMNS} FROM conversations WHERE kind = 'thread' AND workspace_id IS NULL ORDER BY id"))?;
            let threads = statement.query_map([], records::thread_metadata)?.collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(threads)
        })
    }

    pub fn group_threads(&self, first_id: &str, second_id: &str) -> Result<WorkspaceMetadata> {
        self.database.write(|connection| {
            let eligible = |id| connection.query_row("SELECT EXISTS(SELECT 1 FROM conversations WHERE id = ?1 AND kind = 'thread' AND workspace_id IS NULL)", [id], |row| row.get::<_, bool>(0));
            if first_id == second_id || !eligible(first_id)? || !eligible(second_id)? { return Err(StorageError::ThreadNotFound(second_id.into())); }
            let mut workspace = WorkspaceMetadata::new("New workspace".into(), Vec::new());
            put_workspace(connection, &workspace)?;
            for id in [first_id, second_id] {
                let thread = records::get_thread(connection, id)?;
                set_workspace(connection, id, Some(&workspace.id))?;
                workspace.threads.insert(id.into(), thread);
            }
            Ok(workspace)
        })
    }
}
