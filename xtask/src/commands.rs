// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod build;
mod bump;
mod clean;
mod dev;
mod doctor;
mod format;
mod release;
mod test;

use crate::args::Command;

pub fn run(command: Command) -> Result<(), String> {
    match command {
        Command::Dev { demo, forwarded } => dev::run(demo, &forwarded),
        Command::Format { all } => format::run(all),
        Command::Doctor => doctor::run(),
        Command::Test { forwarded } => test::run(&forwarded),
        Command::Clean(target) => clean::run(target),
        Command::Build(target) => build::run(target),
        Command::Bump(arguments) => bump::run(arguments),
        Command::Release(arguments) => release::run(arguments),
    }
}
