// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Title prompt access.

use crate::context::loader::load_title_prompt;

pub fn get_title_prompt() -> Result<String, String> {
    load_title_prompt()
}
