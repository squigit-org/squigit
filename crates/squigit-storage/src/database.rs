// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, Row, TransactionBehavior};
use serde::de::DeserializeOwned;

use crate::{Result, StorageError};

#[derive(Clone)]
pub(crate) struct Database {
    path: PathBuf,
}

impl Database {
    pub(crate) fn new(root: &Path) -> Result<Self> {
        fs::create_dir_all(root)?;
        let metadata = fs::symlink_metadata(root)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(StorageError::KeyStore("Invalid database directory".into()));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(root, fs::Permissions::from_mode(0o700))?;
        }
        let database = Self {
            path: root.join("app.db"),
        };
        database.reject_unsafe_paths()?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        drop(options.open(&database.path)?);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&database.path, fs::Permissions::from_mode(0o600))?;
        }
        let mut connection = database.connect()?;
        let version: u32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version == 0 {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let version: u32 =
                transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
            match version {
                0 => transaction.execute_batch(include_str!("schema.sql"))?,
                1 => {}
                version => return Err(StorageError::DatabaseSchema(version)),
            }
            transaction.commit()?;
        } else if version != 1 {
            return Err(StorageError::DatabaseSchema(version));
        }
        Ok(database)
    }

    fn reject_unsafe_paths(&self) -> Result<()> {
        for path in [
            &self.path,
            &self.path.with_extension("db-wal"),
            &self.path.with_extension("db-shm"),
        ] {
            match fs::symlink_metadata(path) {
                Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                    return Err(StorageError::KeyStore(format!(
                        "Invalid database file: {}",
                        path.display()
                    )));
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }

    fn connect(&self) -> Result<Connection> {
        self.reject_unsafe_paths()?;
        let connection = Connection::open(&self.path)?;
        connection.busy_timeout(Duration::from_secs(10))?;
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
        )?;
        Ok(connection)
    }

    pub(crate) fn read<T>(&self, operation: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let result = operation(&transaction)?;
        transaction.commit()?;
        Ok(result)
    }

    pub(crate) fn write<T, E>(
        &self,
        operation: impl FnOnce(&Connection) -> std::result::Result<T, E>,
    ) -> std::result::Result<T, E>
    where
        E: From<StorageError>,
    {
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(StorageError::from)?;
        let result = operation(&transaction)?;
        transaction.commit().map_err(StorageError::from)?;
        Ok(result)
    }
}

pub(crate) fn json_column<T: DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
    let value: String = row.get(index)?;
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

pub(crate) fn optional_json_column<T: DeserializeOwned>(
    row: &Row<'_>,
    index: usize,
) -> rusqlite::Result<Option<T>> {
    let value: Option<String> = row.get(index)?;
    value
        .map(|value| {
            serde_json::from_str(&value).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    index,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()
}
