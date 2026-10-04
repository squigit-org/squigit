// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::Utc;

use crate::storage::HistoryStore;
pub use crate::storage::{HistoryEntry, HistoryInterface};

pub fn list(interface: HistoryInterface) -> Result<Vec<HistoryEntry>, String> {
    HistoryStore::new()
        .and_then(|store| store.list(interface))
        .map_err(|error| error.to_string())
}

pub fn record_command(interface: HistoryInterface, command: String) -> Result<(), String> {
    HistoryStore::new()
        .and_then(|store| {
            store.append(&HistoryEntry::Command {
                interface,
                command,
                ts: Utc::now(),
            })
        })
        .map_err(|error| error.to_string())
}
