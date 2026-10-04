// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::cas::AttachmentFileType;
use crate::database::{json_column, optional_json_column};
use crate::{Result, StorageError};

use super::{
    AttachmentManifest, AttachmentManifestEntry, ContextWindow, SideChatMetadata, ThreadMessage,
    ThreadMetadata,
};

pub(super) const THREAD_COLUMNS: &str = "id, title, created_at, updated_at, image_hash, original_image_hash, image_blob, pinned_at, fork_family_id, fork_version";
pub(super) const SIDECHAT_COLUMNS: &str =
    "id, title, created_at, updated_at, fork_family_id, fork_version";

pub(super) fn thread_metadata(row: &Row<'_>) -> rusqlite::Result<ThreadMetadata> {
    Ok(ThreadMetadata {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        image_hash: row.get(4)?,
        original_image_hash: row.get(5)?,
        image_blob: row.get(6)?,
        pinned_at: row.get(7)?,
        fork_family_id: row.get(8)?,
        fork_version: row.get(9)?,
    })
}

pub(super) fn sidechat_metadata(row: &Row<'_>) -> rusqlite::Result<SideChatMetadata> {
    Ok(SideChatMetadata {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        fork_family_id: row.get(4)?,
        fork_version: row.get(5)?,
    })
}

pub(super) fn get_thread(connection: &Connection, id: &str) -> Result<ThreadMetadata> {
    connection
        .query_row(
            &format!(
                "SELECT {THREAD_COLUMNS} FROM conversations WHERE id = ?1 AND kind = 'thread'"
            ),
            [id],
            thread_metadata,
        )
        .optional()?
        .ok_or_else(|| StorageError::ThreadNotFound(id.into()))
}

pub(super) fn get_sidechat(connection: &Connection, id: &str) -> Result<SideChatMetadata> {
    connection
        .query_row(
            &format!(
                "SELECT {SIDECHAT_COLUMNS} FROM conversations WHERE id = ?1 AND kind = 'sidechat'"
            ),
            [id],
            sidechat_metadata,
        )
        .optional()?
        .ok_or_else(|| StorageError::ThreadNotFound(id.into()))
}

pub(super) fn conversation_kind(connection: &Connection, id: &str) -> Result<String> {
    connection
        .query_row(
            "SELECT kind FROM conversations WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| StorageError::ThreadNotFound(id.into()))
}

pub(super) fn put_thread(connection: &Connection, metadata: &ThreadMetadata) -> Result<()> {
    connection.execute(
        "INSERT INTO conversations (id, kind, title, created_at, updated_at, image_hash, original_image_hash, image_blob, pinned_at, fork_family_id, fork_version)
         VALUES (?1, 'thread', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT (id) DO UPDATE SET title = excluded.title, created_at = excluded.created_at, updated_at = excluded.updated_at,
         image_hash = excluded.image_hash, original_image_hash = excluded.original_image_hash, image_blob = excluded.image_blob,
         pinned_at = excluded.pinned_at, fork_family_id = excluded.fork_family_id, fork_version = excluded.fork_version",
        params![metadata.id, metadata.title, metadata.created_at, metadata.updated_at, metadata.image_hash,
                metadata.original_image_hash, metadata.image_blob, metadata.pinned_at, metadata.fork_family_id, metadata.fork_version],
    )?;
    Ok(())
}

pub(super) fn put_sidechat(connection: &Connection, metadata: &SideChatMetadata) -> Result<()> {
    connection.execute(
        "INSERT INTO conversations (id, kind, title, created_at, updated_at, fork_family_id, fork_version)
         VALUES (?1, 'sidechat', ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT (id) DO UPDATE SET title = excluded.title, created_at = excluded.created_at, updated_at = excluded.updated_at,
         fork_family_id = excluded.fork_family_id, fork_version = excluded.fork_version",
        params![metadata.id, metadata.title, metadata.created_at, metadata.updated_at, metadata.fork_family_id, metadata.fork_version],
    )?;
    Ok(())
}

pub(super) fn message(row: &Row<'_>) -> rusqlite::Result<ThreadMessage> {
    let role: String = row.get(0)?;
    match role.as_str() {
        "user" => Ok(ThreadMessage::User {
            id: row.get(1)?,
            content: row.get(2)?,
            timestamp: row.get(3)?,
            attachments: json_column(row, 4)?,
            text_citations: optional_json_column(row, 5)?.unwrap_or_default(),
            message_context: optional_json_column(row, 6)?,
        }),
        "assistant" => Ok(ThreadMessage::Assistant {
            id: row.get(1)?,
            content: row.get(2)?,
            timestamp: row.get(3)?,
            citations: json_column(row, 7)?,
            grounding: optional_json_column(row, 8)?,
            error: optional_json_column(row, 9)?,
            forked_from: optional_json_column(row, 10)?,
        }),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

pub(super) fn messages(connection: &Connection, id: &str) -> Result<Vec<ThreadMessage>> {
    let mut statement = connection.prepare(
        "SELECT role, id, content, timestamp, attachments_json, text_citations_json, message_context_json, citations_json,
         grounding_json, error_json, forked_from_json FROM messages WHERE conversation_id = ?1 ORDER BY position",
    )?;
    let messages = statement
        .query_map([id], message)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(messages)
}

pub(super) fn insert_message(
    connection: &Connection,
    id: &str,
    position: usize,
    message: &ThreadMessage,
) -> Result<()> {
    match message {
        ThreadMessage::User {
            id: message_id,
            content,
            timestamp,
            attachments,
            text_citations,
            message_context,
        } => {
            connection.execute(
                "INSERT INTO messages (conversation_id, id, position, role, content, timestamp, attachments_json, text_citations_json, message_context_json)
                 VALUES (?1, ?2, ?3, 'user', ?4, ?5, ?6, ?7, ?8)",
                params![id, message_id, position as i64, content, timestamp, serde_json::to_string(attachments)?,
                        serde_json::to_string(text_citations)?, message_context.as_ref().map(serde_json::to_string).transpose()?],
            )?;
        }
        ThreadMessage::Assistant {
            id: message_id,
            content,
            timestamp,
            citations,
            grounding,
            error,
            forked_from,
        } => {
            connection.execute(
                "INSERT INTO messages (conversation_id, id, position, role, content, timestamp, citations_json, grounding_json, error_json, forked_from_json)
                 VALUES (?1, ?2, ?3, 'assistant', ?4, ?5, ?6, ?7, ?8, ?9)",
                params![id, message_id, position as i64, content, timestamp, serde_json::to_string(citations)?,
                        grounding.as_ref().map(serde_json::to_string).transpose()?, error.as_ref().map(serde_json::to_string).transpose()?,
                        forked_from.as_ref().map(serde_json::to_string).transpose()?],
            )?;
        }
    }
    Ok(())
}

pub(super) fn put_messages(
    connection: &Connection,
    id: &str,
    messages: &[ThreadMessage],
) -> Result<()> {
    connection.execute("DELETE FROM messages WHERE conversation_id = ?1", [id])?;
    for (position, message) in messages.iter().enumerate() {
        insert_message(connection, id, position, message)?;
    }
    Ok(())
}

pub(super) fn context(connection: &Connection, id: &str) -> Result<ContextWindow> {
    Ok(connection.query_row("SELECT tokens_used, compacted_at, compacted_context FROM conversation_context WHERE conversation_id = ?1", [id], |row| {
        Ok(ContextWindow { tokens_used: row.get(0)?, compacted_at: row.get(1)?, compacted_context: row.get(2)? })
    }).optional()?.unwrap_or_default())
}

pub(super) fn put_context(
    connection: &Connection,
    id: &str,
    context: &ContextWindow,
    preserve_existing: bool,
) -> Result<()> {
    let conflict = if preserve_existing {
        "DO NOTHING"
    } else {
        "DO UPDATE SET tokens_used = excluded.tokens_used, compacted_at = excluded.compacted_at, compacted_context = excluded.compacted_context"
    };
    connection.execute(&format!("INSERT INTO conversation_context (conversation_id, tokens_used, compacted_at, compacted_context) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (conversation_id) {conflict}"),
        params![id, context.tokens_used, context.compacted_at, context.compacted_context])?;
    Ok(())
}

pub(super) fn attachments(connection: &Connection, id: &str) -> Result<AttachmentManifest> {
    let mut statement = connection.prepare("SELECT attachment_hash, display_name, file_type, file_brief, last_mention_at FROM conversation_attachments WHERE conversation_id = ?1 ORDER BY position")?;
    let manifest = statement
        .query_map([id], |row| {
            let file_type: String = row.get(2)?;
            let file_type = match file_type.as_str() {
                "image" => AttachmentFileType::Image,
                "document" => AttachmentFileType::Document,
                "video" => AttachmentFileType::Video,
                "audio" => AttachmentFileType::Audio,
                _ => return Err(rusqlite::Error::InvalidQuery),
            };
            Ok(AttachmentManifestEntry {
                attachment_hash: row.get(0)?,
                display_name: row.get(1)?,
                file_type,
                file_brief: row.get(3)?,
                last_mention_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(manifest)
}

pub(super) fn put_attachments(
    connection: &Connection,
    id: &str,
    manifest: &AttachmentManifest,
) -> Result<()> {
    connection.execute(
        "DELETE FROM conversation_attachments WHERE conversation_id = ?1",
        [id],
    )?;
    for (position, entry) in manifest.iter().enumerate() {
        let file_type = match entry.file_type {
            AttachmentFileType::Image => "image",
            AttachmentFileType::Document => "document",
            AttachmentFileType::Video => "video",
            AttachmentFileType::Audio => "audio",
        };
        connection.execute("INSERT INTO conversation_attachments (conversation_id, attachment_hash, position, display_name, file_type, file_brief, last_mention_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, entry.attachment_hash, position as i64, entry.display_name, file_type, entry.file_brief, entry.last_mention_at])?;
    }
    Ok(())
}
