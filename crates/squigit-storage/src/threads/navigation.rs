// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashSet;

use rusqlite::{params, OptionalExtension};

use crate::{Result, StorageError};

use super::{records, StoredMessagePage, ThreadStorage};

pub struct StoredMessageNavigation {
    pub id: String,
    pub position: u32,
}

pub struct StoredMessagePreview {
    pub prompt: String,
    pub reply: Option<String>,
}

impl ThreadStorage {
    pub fn message_navigation(&self, id: &str) -> Result<Vec<StoredMessageNavigation>> {
        self.database.read(|connection| {
            records::conversation_kind(connection, id)?;
            let mut statement = connection.prepare(
                "SELECT id, position FROM messages WHERE conversation_id = ?1 AND role = 'user' ORDER BY position",
            )?;
            let prompts = statement
                .query_map([id], |row| {
                    Ok(StoredMessageNavigation { id: row.get(0)?, position: row.get(1)? })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(prompts)
        })
    }

    pub fn message_preview(
        &self,
        id: &str,
        message_id: &str,
    ) -> Result<Option<StoredMessagePreview>> {
        self.database.read(|connection| {
            let prompt = connection.query_row(
                "SELECT position, substr(content, 1, 2048) FROM messages WHERE conversation_id = ?1 AND id = ?2 AND role = 'user'",
                params![id, message_id],
                |row| Ok((row.get::<_, u32>(0)?, row.get::<_, String>(1)?)),
            ).optional()?;
            let Some((position, prompt)) = prompt else { return Ok(None); };
            let next = connection.query_row(
                "SELECT role, substr(content, 1, 2048) FROM messages WHERE conversation_id = ?1 AND position > ?2 ORDER BY position LIMIT 1",
                params![id, position],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            ).optional()?;
            let reply = next.and_then(|(role, content)| (role == "assistant").then_some(content));
            Ok(Some(StoredMessagePreview { prompt, reply }))
        })
    }

    pub fn message_path(
        &self,
        id: &str,
        message_id: &str,
        before: u32,
    ) -> Result<StoredMessagePage> {
        self.database.read(|connection| {
            records::conversation_kind(connection, id)?;
            let position = connection.query_row(
                "SELECT position FROM messages WHERE conversation_id = ?1 AND id = ?2",
                params![id, message_id],
                |row| row.get::<_, u32>(0),
            ).optional()?.ok_or_else(|| StorageError::InvalidThreadMessage(format!("message {message_id} was not found")))?;
            if position >= before {
                return Ok(StoredMessagePage { messages: Vec::new(), manifest: Vec::new(), before: Some(before) });
            }
            let mut statement = connection.prepare(
                "SELECT role, id, content, timestamp, attachments_json, text_citations_json, message_context_json, citations_json, grounding_json, error_json, forked_from_json FROM messages WHERE conversation_id = ?1 AND position >= ?2 AND position < ?3 ORDER BY position",
            )?;
            let messages = statement.query_map(params![id, position, before], records::message)?.collect::<rusqlite::Result<Vec<_>>>()?;
            let hashes = messages.iter().flat_map(|message| message.attachments().iter().map(|attachment| attachment.attachment_hash.as_str())).collect::<HashSet<_>>();
            let mut manifest = records::attachments(connection, id)?;
            manifest.retain(|entry| hashes.contains(entry.attachment_hash.as_str()));
            let has_older = connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM messages WHERE conversation_id = ?1 AND position < ?2)",
                params![id, position],
                |row| row.get::<_, bool>(0),
            )?;
            Ok(StoredMessagePage { messages, manifest, before: has_older.then_some(position) })
        })
    }
}
