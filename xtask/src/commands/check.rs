// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;

#[derive(Debug, Clone, Default)]
pub struct CheckCommandOptions {
    pub list: bool,
    pub path: Vec<String>,
}

pub fn run(options: CheckCommandOptions) -> Result<()> {
    crate::tests::runner::run_check(options)
}
