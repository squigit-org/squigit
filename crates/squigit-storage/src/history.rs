// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};

use crate::{Result, StorageError, ThreadMessage};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HistoryInterface {
    Gui,
    Cli,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum HistoryEntry {
    Message {
        interface: HistoryInterface,
        message: String,
        ts: DateTime<Utc>,
    },
    Command {
        interface: HistoryInterface,
        command: String,
        ts: DateTime<Utc>,
    },
}

impl HistoryEntry {
    pub fn interface(&self) -> HistoryInterface {
        match self {
            Self::Message { interface, .. } | Self::Command { interface, .. } => *interface,
        }
    }

    pub fn timestamp(&self) -> DateTime<Utc> {
        match self {
            Self::Message { ts, .. } | Self::Command { ts, .. } => *ts,
        }
    }

    fn validate(&self) -> Result<()> {
        let valid = match self {
            Self::Message { message, .. } => ThreadMessage::is_valid_id(message),
            Self::Command { command, .. } => command.starts_with('/'),
        };
        if valid {
            Ok(())
        } else {
            Err(StorageError::InvalidHistory(
                "Invalid composer history entry".into(),
            ))
        }
    }
}

pub struct HistoryStore {
    path: PathBuf,
}

impl HistoryStore {
    pub fn new() -> Result<Self> {
        Self::with_base_dir(crate::paths::base_config_dir().ok_or(StorageError::NoConfigDir)?)
    }

    pub fn with_base_dir(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        let metadata = fs::symlink_metadata(&root)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(StorageError::InvalidHistory(
                "Invalid history directory".into(),
            ));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
        }
        Ok(Self {
            path: root.join("history.jsonl"),
        })
    }

    fn lock(&self) -> Result<HistoryGuard> {
        match fs::symlink_metadata(&self.path) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                return Err(StorageError::InvalidHistory("Invalid history file".into()));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        let mut options = OpenOptions::new();
        options.read(true).append(true).create(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&self.path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.path, fs::Permissions::from_mode(0o600))?;
        }
        file.lock_exclusive()?;
        Ok(HistoryGuard { file })
    }

    pub fn append(&self, entry: &HistoryEntry) -> Result<()> {
        entry.validate()?;
        let mut guard = self.lock()?;
        discard_incomplete_tail(&mut guard.file)?;
        let mut line = serde_json::to_vec(entry)?;
        line.push(b'\n');
        guard.file.write_all(&line)?;
        guard.file.sync_all()?;
        Ok(())
    }

    pub fn append_message(
        &self,
        interface: HistoryInterface,
        message: &ThreadMessage,
    ) -> Result<()> {
        let ThreadMessage::User { id, timestamp, .. } = message else {
            return Err(StorageError::InvalidHistory(
                "Only composer messages enter history".into(),
            ));
        };
        self.append(&HistoryEntry::Message {
            interface,
            message: id.clone(),
            ts: *timestamp,
        })
    }

    pub fn list(&self, interface: HistoryInterface) -> Result<Vec<HistoryEntry>> {
        let guard = self.lock()?;
        let mut reader = BufReader::new(&guard.file);
        let mut line = String::new();
        let mut entries = Vec::new();
        while reader.read_line(&mut line)? != 0 {
            if !line.ends_with('\n') {
                break;
            }
            let entry: HistoryEntry = serde_json::from_str(&line)?;
            entry.validate()?;
            if entry.interface() == interface {
                entries.push(entry);
            }
            line.clear();
        }
        entries.sort_by_key(HistoryEntry::timestamp);
        Ok(entries)
    }
}

struct HistoryGuard {
    file: File,
}

impl Drop for HistoryGuard {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

fn discard_incomplete_tail(file: &mut File) -> Result<()> {
    let mut end = file.metadata()?.len();
    let mut buffer = [0; 4096];
    while end > 0 {
        let start = end.saturating_sub(buffer.len() as u64);
        let count = (end - start) as usize;
        file.seek(SeekFrom::Start(start))?;
        file.read_exact(&mut buffer[..count])?;
        if let Some(index) = buffer[..count].iter().rposition(|byte| *byte == b'\n') {
            let complete = start + index as u64 + 1;
            if complete != file.metadata()?.len() {
                file.set_len(complete)?;
            }
            return Ok(());
        }
        end = start;
    }
    file.set_len(0)?;
    Ok(())
}
