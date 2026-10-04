// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use fs2::FileExt;
use rusqlite::Connection;

use crate::{Result, ThreadStorage};

pub struct ObjectStoreGuard {
    file: File,
}

impl Drop for ObjectStoreGuard {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

fn canonical_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn require_directory(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid cache directory").into());
    }
    Ok(())
}

fn path_size(path: &Path) -> Result<u64> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
    };
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    if !metadata.is_dir() {
        return Ok(0);
    }
    let mut size = 0;
    for entry in fs::read_dir(path)? {
        size += path_size(&entry?.path())?;
    }
    Ok(size)
}

fn remove_path(path: &Path) -> Result<u64> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
    };
    let size = path_size(path)?;
    let result = if metadata.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    match result {
        Ok(()) => Ok(size),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(0),
        Err(error) => Err(error.into()),
    }
}

fn clear_directory(path: &Path) -> Result<u64> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
        Ok(_) => require_directory(path)?,
    }
    let mut size = 0;
    for entry in fs::read_dir(path)? {
        size += remove_path(&entry?.path())?;
    }
    Ok(size)
}

fn recently_used(path: &Path, cutoff: SystemTime) -> Result<bool> {
    for entry in fs::read_dir(path)? {
        let metadata = match fs::symlink_metadata(entry?.path()) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        if metadata.modified()? >= cutoff {
            return Ok(true);
        }
    }
    Ok(false)
}

impl ThreadStorage {
    fn object_store_guard(&self, exclusive: bool) -> Result<ObjectStoreGuard> {
        let path = self.base_dir.join("objects.lock");
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Invalid object store lock",
                )
                .into());
            }
            Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error.into()),
            _ => {}
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(path)?;
        if exclusive {
            FileExt::lock_exclusive(&file)?;
        } else {
            FileExt::lock_shared(&file)?;
        }
        Ok(ObjectStoreGuard { file })
    }

    pub fn lock_object_store(&self) -> Result<ObjectStoreGuard> {
        self.object_store_guard(false)
    }

    fn unused_objects(
        &self,
        connection: &Connection,
        protected_hashes: &[String],
    ) -> Result<Vec<PathBuf>> {
        require_directory(&self.objects_dir)?;
        let cutoff = SystemTime::now()
            .checked_sub(Duration::from_secs(60))
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let mut statement = connection.prepare(
            "SELECT hash FROM (
                    SELECT image_hash AS hash FROM conversations
                    UNION ALL SELECT original_image_hash FROM conversations
                    UNION ALL SELECT attachment_hash FROM conversation_attachments
                    UNION ALL SELECT json_extract(attachment.value, '$.attachment_hash')
                        FROM messages, json_each(messages.attachments_json) AS attachment
                ) WHERE hash IS NOT NULL",
        )?;
        let mut live = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<HashSet<_>>>()?;
        live.extend(
            protected_hashes
                .iter()
                .filter(|hash| canonical_hash(hash))
                .cloned(),
        );
        let hashes = regex::Regex::new(r"\b[0-9a-f]{64}\b").expect("CAS hash regex must compile");
        let mut context = connection.prepare(
            "SELECT context.atom FROM messages, json_tree(messages.message_context_json) AS context
                 WHERE context.key = 'content' AND context.type = 'text'",
        )?;
        for content in context.query_map([], |row| row.get::<_, String>(0))? {
            let content = content?;
            live.extend(
                hashes
                    .find_iter(&content)
                    .map(|hash| hash.as_str().to_string()),
            );
        }
        let mut unused = Vec::new();
        for prefix in fs::read_dir(&self.objects_dir)? {
            let prefix = prefix?;
            let name = prefix.file_name();
            let Some(name) = name.to_str().filter(|name| {
                name.len() == 2
                    && name
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            }) else {
                continue;
            };
            if !prefix.file_type()?.is_dir() {
                continue;
            }
            for object in fs::read_dir(prefix.path())? {
                let object = object?;
                let hash = object.file_name();
                let Some(hash) = hash
                    .to_str()
                    .filter(|hash| canonical_hash(hash) && hash.starts_with(name))
                else {
                    continue;
                };
                if !object.file_type()?.is_dir()
                    || live.contains(hash)
                    || recently_used(&object.path(), cutoff)?
                {
                    continue;
                }
                unused.push(object.path());
            }
        }
        Ok(unused)
    }

    pub fn cache_size(&self, protected_hashes: &[String]) -> Result<u64> {
        let _guard = self.lock_object_store()?;
        let unused = self
            .database
            .read(|connection| self.unused_objects(connection, protected_hashes))?;
        let mut size = path_size(&self.base_dir.join("cache"))?;
        for path in unused {
            size += path_size(&path)?;
        }
        Ok(size)
    }

    pub fn clear_cache(&self, protected_hashes: &[String]) -> Result<u64> {
        let _guard = self.object_store_guard(true)?;
        let removed = self.database.write(|connection| -> Result<u64> {
            let mut size = 0;
            for path in self.unused_objects(connection, protected_hashes)? {
                let hash = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| {
                        io::Error::new(io::ErrorKind::InvalidInput, "Invalid object path")
                    })?;
                let lock = self.lock_object_manifest(hash)?;
                size += remove_path(&path)?;
                drop(lock);
            }
            Ok(size)
        })?;
        Ok(removed + clear_directory(&self.base_dir.join("cache"))?)
    }
}
