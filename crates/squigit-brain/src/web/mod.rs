// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod constants;
mod favicon;
mod fetch;
mod html;
mod query;
mod retry;
mod safe_sources;
mod transport;
mod types;
mod url_utils;

pub(crate) use fetch::{collect_allowed_sources, fetch_url_from_allowed};
pub(crate) use query::search_query;
