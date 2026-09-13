// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod args;
mod cache;
mod commands;
mod process;
mod registry;
mod workspace;

#[path = "../../squigit-ocr/build.rs"]
mod ocr_build;

use args::{parse, ParseOutcome};

pub fn run(arguments: &[String]) -> i32 {
    let command = match parse(arguments) {
        Ok(ParseOutcome::Help(help)) => {
            println!("{help}");
            return 0;
        }
        Ok(ParseOutcome::Command(command)) => command,
        Err(error) => {
            eprintln!("xtask: {error}");
            return 2;
        }
    };

    match commands::run(command) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("xtask: {error}");
            1
        }
    }
}
