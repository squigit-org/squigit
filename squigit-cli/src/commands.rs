// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SlashCommand {
    Model,
    Analyze,
    Resume,
    Rename,
    Delete,
    Fork,
    Scan,
    Lens,
    Translate,
    Logout,
    Login,
    Switch,
    Configure,
    Reveal,
    Stop,
    Clear,
    Personality,
    InstallOcr,
}

#[derive(Clone, Copy, Debug)]
pub struct CommandSpec {
    pub command: SlashCommand,
    pub name: &'static str,
    pub description: &'static str,
}

pub const COMMANDS: &[CommandSpec] = &[
    CommandSpec::new(
        SlashCommand::Model,
        "/model",
        "choose model, effort, and OCR language",
    ),
    CommandSpec::new(
        SlashCommand::Analyze,
        "/analyze",
        "start a thread from an image path",
    ),
    CommandSpec::new(
        SlashCommand::Resume,
        "/resume",
        "resume a thread for this directory",
    ),
    CommandSpec::new(
        SlashCommand::Rename,
        "/rename",
        "rename or generate the current title",
    ),
    CommandSpec::new(
        SlashCommand::Delete,
        "/delete",
        "permanently delete the current thread",
    ),
    CommandSpec::new(
        SlashCommand::Fork,
        "/fork",
        "fork the current thread at its latest state",
    ),
    CommandSpec::new(
        SlashCommand::Scan,
        "/scan",
        "scan the current image with an OCR model",
    ),
    CommandSpec::new(
        SlashCommand::Lens,
        "/lens",
        "search Google Lens for the current image",
    ),
    CommandSpec::new(
        SlashCommand::Translate,
        "/translate",
        "translate the latest OCR text",
    ),
    CommandSpec::new(
        SlashCommand::Logout,
        "/logout",
        "log out and continue as guest",
    ),
    CommandSpec::new(SlashCommand::Login, "/login", "log in through the browser"),
    CommandSpec::new(SlashCommand::Switch, "/switch", "switch the active profile"),
    CommandSpec::new(
        SlashCommand::Configure,
        "/configure",
        "configure Gemini and ImgBB API keys",
    ),
    CommandSpec::new(
        SlashCommand::Reveal,
        "/reveal",
        "reveal API keys after a PIN challenge",
    ),
    CommandSpec::new(
        SlashCommand::Stop,
        "/stop",
        "inspect and cancel background work",
    ),
    CommandSpec::new(
        SlashCommand::Clear,
        "/clear",
        "clear the session and return home",
    ),
    CommandSpec::new(
        SlashCommand::Personality,
        "/personality",
        "edit Squigit's communication style",
    ),
    CommandSpec::new(
        SlashCommand::InstallOcr,
        "/install_ocr",
        "install the Squigit OCR engine",
    ),
];

impl CommandSpec {
    const fn new(command: SlashCommand, name: &'static str, description: &'static str) -> Self {
        Self {
            command,
            name,
            description,
        }
    }
}

pub fn matching_commands(input: &str) -> Vec<CommandSpec> {
    let command = input
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    COMMANDS
        .iter()
        .copied()
        .filter(|candidate| candidate.name.starts_with(&command))
        .collect()
}

pub fn parse_command(input: &str) -> Option<(SlashCommand, &str)> {
    let input = input.trim();
    let (name, arguments) = input
        .split_once(char::is_whitespace)
        .map_or((input, ""), |(name, arguments)| (name, arguments.trim()));
    COMMANDS
        .iter()
        .find(|candidate| candidate.name == name)
        .map(|candidate| (candidate.command, arguments))
}
