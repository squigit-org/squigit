// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::{BTreeMap, HashSet};

use chrono::{DateTime, Utc};
use rusqlite::params;

use crate::{Result, StorageError};

use super::{
    records, AttachmentManifest, ThreadMessage, ThreadMetadata, ThreadStorage, WorkspaceMetadata,
};

pub struct StoredThreadPage {
    pub threads: Vec<ThreadMetadata>,
    pub total: u32,
}

pub struct StoredWorkspacePage {
    pub workspaces: Vec<(WorkspaceMetadata, u32, DateTime<Utc>)>,
    pub total: u32,
}

pub struct StoredMessagePage {
    pub messages: Vec<ThreadMessage>,
    pub manifest: AttachmentManifest,
    pub before: Option<u32>,
}

fn ordering_column(ordering: &str) -> Result<&'static str> {
    match ordering {
        "created" => Ok("created_at"),
        "updated" | "custom" => Ok("updated_at"),
        _ => Err(StorageError::InvalidThreadMessage(
            "Invalid ordering".into(),
        )),
    }
}

impl ThreadStorage {
    pub fn thread_page(
        &self,
        workspace_id: Option<&str>,
        offset: u32,
        limit: u32,
        ordering: &str,
        custom_order: &[String],
    ) -> Result<StoredThreadPage> {
        let column = ordering_column(ordering)?;
        let order = serde_json::to_string(if ordering == "custom" {
            custom_order
        } else {
            &[]
        })?;
        self.database.read(|connection| {
            let total = connection.query_row("SELECT count(*) FROM conversations WHERE kind = 'thread' AND workspace_id IS ?1", [workspace_id], |row| row.get(0))?;
            let rank = "coalesce((SELECT CAST(key AS INTEGER) FROM json_each(?4) WHERE value = conversations.id), -1),";
            let mut statement = connection.prepare(&format!("SELECT {} FROM conversations WHERE kind = 'thread' AND workspace_id IS ?1 ORDER BY pinned_at IS NULL, julianday(pinned_at) DESC, {rank} julianday({column}) DESC, id LIMIT ?2 OFFSET ?3", records::THREAD_COLUMNS))?;
            let threads = statement.query_map(params![workspace_id, limit, offset, order], records::thread_metadata)?.collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(StoredThreadPage { threads, total })
        })
    }

    pub fn workspace_page(
        &self,
        offset: u32,
        limit: u32,
        ordering: &str,
        custom_order: &[String],
    ) -> Result<StoredWorkspacePage> {
        ordering_column(ordering)?;
        let order = serde_json::to_string(if ordering == "custom" {
            custom_order
        } else {
            &[]
        })?;
        self.database.read(|connection| {
            let total = connection.query_row("SELECT count(*) FROM workspaces", [], |row| row.get(0))?;
            let rank = "coalesce((SELECT CAST(key AS INTEGER) FROM json_each(?3) WHERE value = w.id), -1),";
            let timestamp = if ordering == "created" { "w.created_at" } else { "coalesce((SELECT updated_at FROM conversations WHERE workspace_id = w.id ORDER BY julianday(updated_at) DESC LIMIT 1), w.created_at)" };
            let mut statement = connection.prepare(&format!("SELECT w.id, w.name, w.created_at, (SELECT count(*) FROM conversations WHERE workspace_id = w.id AND kind = 'thread'), coalesce((SELECT updated_at FROM conversations WHERE workspace_id = w.id ORDER BY julianday(updated_at) DESC LIMIT 1), w.created_at) FROM workspaces w ORDER BY {rank} julianday({timestamp}) DESC, w.id LIMIT ?1 OFFSET ?2"))?;
            let mut workspaces = statement.query_map(params![limit, offset, order], |row| Ok((WorkspaceMetadata { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)?, directories: Vec::new(), threads: BTreeMap::new() }, row.get(3)?, row.get(4)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
            let mut directories = connection.prepare("SELECT path FROM workspace_directories WHERE workspace_id = ?1 ORDER BY position")?;
            for (workspace, _, _) in &mut workspaces {
                workspace.directories = directories.query_map([&workspace.id], |row| row.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
            }
            Ok(StoredWorkspacePage { workspaces, total })
        })
    }

    pub fn existing_thread_ids(&self, ids: &[String]) -> Result<Vec<String>> {
        let ids = serde_json::to_string(ids)?;
        self.database.read(|connection| {
            let mut statement = connection.prepare("SELECT id FROM conversations WHERE kind = 'thread' AND id IN (SELECT value FROM json_each(?1))")?;
            let ids = statement.query_map([ids], |row| row.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(ids)
        })
    }

    pub fn message_page(
        &self,
        id: &str,
        before: Option<u32>,
        limit: u32,
    ) -> Result<StoredMessagePage> {
        self.database.read(|connection| {
            records::conversation_kind(connection, id)?;
            let limit = limit.clamp(1, 100);
            let mut statement = connection.prepare("SELECT role, id, content, timestamp, attachments_json, text_citations_json, message_context_json, citations_json, grounding_json, error_json, forked_from_json, position FROM messages WHERE conversation_id = ?1 AND position < ?2 ORDER BY position DESC LIMIT ?3")?;
            let mut rows = statement.query_map(params![id, before.map(i64::from).unwrap_or(i64::MAX), limit + 1], |row| Ok((records::message(row)?, row.get::<_, u32>(11)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
            let has_more = rows.len() > limit as usize;
            rows.truncate(limit as usize);
            let before = has_more.then(|| rows.last().map(|(_, position)| *position)).flatten();
            rows.reverse();
            let messages = rows.into_iter().map(|(message, _)| message).collect::<Vec<_>>();
            let hashes = messages.iter().flat_map(|message| message.attachments().iter().map(|attachment| attachment.attachment_hash.as_str())).collect::<HashSet<_>>();
            let mut manifest = records::attachments(connection, id)?;
            manifest.retain(|entry| hashes.contains(entry.attachment_hash.as_str()));
            Ok(StoredMessagePage { messages, manifest, before })
        })
    }
}
