// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use uuid::Uuid;

use crate::{database::Database, Result, StorageError};

const RESOLVED_MODEL_FILTER: &str = "AND model <> 'free' AND model NOT LIKE '~%'";

#[derive(Clone)]
pub struct UsageStore {
    database: Database,
}

#[derive(Clone)]
pub struct UsageRequest {
    pub id: String,
    pub generation_id: Option<String>,
    pub profile_id: String,
    pub conversation_id: String,
    pub task: String,
    pub timestamp_ms: i64,
    pub model: String,
    pub cost_usd: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBucket {
    pub date: String,
    pub key: String,
    pub value: f64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageAnalytics {
    pub updated_at: String,
    pub messages: Vec<UsageBucket>,
    pub spend: Vec<UsageBucket>,
    pub tools: Vec<UsageBucket>,
    pub unreported_costs: Vec<UsageBucket>,
}

impl UsageStore {
    pub fn new() -> Result<Self> {
        let root = crate::paths::base_config_dir().ok_or(StorageError::NoDataDir)?;
        Ok(Self {
            database: Database::new(&root)?,
        })
    }

    pub fn record_message(
        &self,
        profile_id: &str,
        conversation_id: &str,
        message_id: &str,
        model: &str,
    ) -> Result<()> {
        self.database.write(|connection| {
            let timestamp: DateTime<Utc> = connection.query_row(
                "SELECT timestamp FROM messages WHERE conversation_id = ?1 AND id = ?2 AND role = 'user'",
                params![conversation_id, message_id],
                |row| row.get(0),
            )?;
            connection.execute(
                "INSERT INTO usage_messages (message_id, profile_id, conversation_id, timestamp_ms, model)
                 VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (message_id) DO UPDATE SET model = excluded.model
                 WHERE usage_messages.profile_id = excluded.profile_id",
                params![message_id, profile_id, conversation_id, timestamp.timestamp_millis(), model],
            )?;
            Ok(())
        })
    }

    pub fn record_request(&self, request: &UsageRequest) -> Result<()> {
        self.database.write(|connection| {
            connection.execute(
                "INSERT INTO usage_requests (id, generation_id, profile_id, conversation_id, task, timestamp_ms, model, cost_usd)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT (id) DO UPDATE SET generation_id = COALESCE(excluded.generation_id, generation_id),
                 model = excluded.model, cost_usd = COALESCE(excluded.cost_usd, cost_usd)",
                params![request.id, request.generation_id, request.profile_id, request.conversation_id,
                    request.task, request.timestamp_ms, request.model, request.cost_usd],
            )?;
            Ok(())
        })
    }

    pub fn record_tool(
        &self,
        profile_id: &str,
        conversation_id: &str,
        name: &str,
        calls: u32,
    ) -> Result<()> {
        self.database.write(|connection| {
            connection.execute(
                "INSERT INTO usage_tools (id, profile_id, conversation_id, timestamp_ms, name, calls)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![Uuid::new_v4().to_string(), profile_id, conversation_id, Utc::now().timestamp_millis(), name, calls],
            )?;
            Ok(())
        })
    }

    pub fn analytics(
        &self,
        profile_id: &str,
        since_ms: i64,
        until_ms: i64,
    ) -> Result<UsageAnalytics> {
        self.database.read(|connection| {
            let buckets = |table, key, value, filter| {
                aggregate(
                    connection, table, key, value, filter, profile_id, since_ms, until_ms,
                )
            };
            Ok(UsageAnalytics {
                updated_at: Utc::now().to_rfc3339(),
                messages: buckets("usage_messages", "model", "COUNT(*)", RESOLVED_MODEL_FILTER)?,
                spend: buckets(
                    "usage_requests",
                    "model",
                    "SUM(cost_usd)",
                    &format!("{RESOLVED_MODEL_FILTER} AND cost_usd IS NOT NULL"),
                )?,
                tools: buckets("usage_tools", "name", "SUM(calls)", "")?,
                unreported_costs: buckets(
                    "usage_requests",
                    "model",
                    "COUNT(*)",
                    &format!("{RESOLVED_MODEL_FILTER} AND cost_usd IS NULL"),
                )?,
            })
        })
    }
}

fn aggregate(
    connection: &Connection,
    table: &str,
    key: &str,
    value: &str,
    filter: &str,
    profile_id: &str,
    since_ms: i64,
    until_ms: i64,
) -> Result<Vec<UsageBucket>> {
    let mut statement = connection.prepare(&format!(
        "SELECT date(timestamp_ms / 1000, 'unixepoch', 'localtime') AS day, {key}, CAST({value} AS REAL)
         FROM {table} WHERE profile_id = ?1 AND timestamp_ms >= ?2 AND timestamp_ms <= ?3 {filter}
         GROUP BY day, {key} ORDER BY day, {key}"
    ))?;
    let rows = statement.query_map(params![profile_id, since_ms, until_ms], |row| {
        Ok(UsageBucket {
            date: row.get(0)?,
            key: row.get(1)?,
            value: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}
