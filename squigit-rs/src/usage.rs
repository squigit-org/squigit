// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{Days, Local, Utc};
pub use squigit_storage::UsageAnalytics;
use squigit_storage::{ProfileStore, UsageStore};

pub fn load_analytics() -> Result<UsageAnalytics, String> {
    let profile = ProfileStore::new()
        .map_err(|error| error.to_string())?
        .get_active_profile_id()
        .map_err(|error| error.to_string())?;
    let Some(profile_id) = profile else {
        return Ok(UsageAnalytics {
            updated_at: Utc::now().to_rfc3339(),
            ..Default::default()
        });
    };
    let today = Local::now().date_naive();
    let since = today
        .checked_sub_days(Days::new(29))
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .and_then(|date| date.and_local_timezone(Local).earliest())
        .ok_or("Could not determine the usage date range")?;
    UsageStore::new()
        .map_err(|error| error.to_string())?
        .analytics(
            &profile_id,
            since.timestamp_millis(),
            Utc::now().timestamp_millis(),
        )
        .map_err(|error| error.to_string())
}
