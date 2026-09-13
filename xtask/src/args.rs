// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub const HELP: &str = "Squigit repository tasks

Usage: cargo xtask <COMMAND> [ARGS]

Commands:
  dev      Start the Squigit terminal interface
  fmt      Format changed files or the complete repository
  doctor   Validate repository source and the Rust workspace
  test     Run all Rust tests and targets
  clean    Remove Cargo or PaddleX build output
  build    Build the CLI or native OCR runtime
  bump     Apply a manually selected semantic version
  release  Publish crates or dispatch a product release

Run `cargo xtask <COMMAND> --help` for command details.";

const DEV_HELP: &str = "Start the Squigit terminal interface

Usage: cargo xtask dev [--demo] [-- <squigit arguments>]";

const FORMAT_HELP: &str = "Format repository source files

Usage: cargo xtask fmt [--all]";

const DOCTOR_HELP: &str = "Validate repository source and the Rust workspace

Usage: cargo xtask doctor";

const TEST_HELP: &str = "Run all Rust tests and targets

Usage: cargo xtask test [-- <cargo test arguments>]";

const CLEAN_HELP: &str = "Remove generated build output

Usage: cargo xtask clean (--target | --paddlex | --all)";

const BUILD_HELP: &str = "Build one product

Usage: cargo xtask build (--cli | --ocr)";

const BUMP_HELP: &str = "Apply a manually selected semantic version

Usage:
  cargo xtask bump (--storage | --auth | --harness | --brain | --squigit | --cli) <VERSION>
  cargo xtask bump --ocr [--crate | --engine] <VERSION>";

const RELEASE_HELP: &str = "Publish crates or dispatch a product release

Usage: cargo xtask release (--ocr | --cli | --facade) [--dry-run] [--yes]";

#[derive(Debug)]
pub enum Command {
    Dev { demo: bool, forwarded: Vec<String> },
    Format { all: bool },
    Doctor,
    Test { forwarded: Vec<String> },
    Clean(CleanTarget),
    Build(BuildTarget),
    Bump(BumpArgs),
    Release(ReleaseArgs),
}

#[derive(Clone, Copy, Debug)]
pub enum CleanTarget {
    Target,
    Paddlex,
    All,
}

#[derive(Clone, Copy, Debug)]
pub enum BuildTarget {
    Cli,
    Ocr,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BumpTarget {
    Storage,
    Auth,
    Harness,
    Brain,
    Squigit,
    Cli,
    Ocr,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OcrKind {
    Crate,
    Engine,
}

#[derive(Debug)]
pub struct BumpArgs {
    pub target: BumpTarget,
    pub ocr_kind: Option<OcrKind>,
    pub version: String,
}

#[derive(Clone, Copy, Debug)]
pub enum ReleaseTarget {
    Ocr,
    Cli,
    Facade,
}

#[derive(Debug)]
pub struct ReleaseArgs {
    pub target: ReleaseTarget,
    pub dry_run: bool,
    pub yes: bool,
}

pub enum ParseOutcome {
    Command(Command),
    Help(&'static str),
}

pub fn parse(arguments: &[String]) -> Result<ParseOutcome, String> {
    let Some(command) = arguments.first().map(String::as_str) else {
        return Ok(ParseOutcome::Help(HELP));
    };
    if matches!(command, "help" | "-h" | "--help") {
        return if arguments.len() == 1 {
            Ok(ParseOutcome::Help(HELP))
        } else {
            command_help(&arguments[1])
                .map(ParseOutcome::Help)
                .ok_or_else(|| format!("unknown command {}", arguments[1]))
        };
    }
    if arguments
        .get(1)
        .is_some_and(|value| value == "-h" || value == "--help")
    {
        return command_help(command)
            .map(ParseOutcome::Help)
            .ok_or_else(|| format!("unknown command {command}"));
    }

    let rest = &arguments[1..];
    let command = match command {
        "dev" => parse_dev(rest)?,
        "fmt" => Command::Format {
            all: parse_optional_flag("fmt", rest, "--all")?,
        },
        "doctor" => {
            require_empty("doctor", rest)?;
            Command::Doctor
        }
        "test" => Command::Test {
            forwarded: rest.to_vec(),
        },
        "clean" => Command::Clean(parse_one_flag(
            "clean",
            rest,
            &[
                ("--target", CleanTarget::Target),
                ("--paddlex", CleanTarget::Paddlex),
                ("--all", CleanTarget::All),
            ],
        )?),
        "build" => Command::Build(parse_one_flag(
            "build",
            rest,
            &[("--cli", BuildTarget::Cli), ("--ocr", BuildTarget::Ocr)],
        )?),
        "bump" => Command::Bump(parse_bump(rest)?),
        "release" => Command::Release(parse_release(rest)?),
        other => return Err(format!("unknown command {other}\n\n{HELP}")),
    };
    Ok(ParseOutcome::Command(command))
}

fn command_help(command: &str) -> Option<&'static str> {
    match command {
        "dev" => Some(DEV_HELP),
        "fmt" => Some(FORMAT_HELP),
        "doctor" => Some(DOCTOR_HELP),
        "test" => Some(TEST_HELP),
        "clean" => Some(CLEAN_HELP),
        "build" => Some(BUILD_HELP),
        "bump" => Some(BUMP_HELP),
        "release" => Some(RELEASE_HELP),
        _ => None,
    }
}

fn parse_dev(arguments: &[String]) -> Result<Command, String> {
    let mut demo = false;
    let mut forwarded = Vec::new();
    let mut separator = false;
    for argument in arguments {
        if !separator && argument == "--" {
            separator = true;
        } else if !separator && argument == "--demo" {
            demo = true;
        } else if !separator {
            return Err(format!(
                "dev does not accept {argument:?} before `--`\n\n{DEV_HELP}"
            ));
        } else {
            forwarded.push(argument.clone());
        }
    }
    Ok(Command::Dev { demo, forwarded })
}

fn parse_bump(arguments: &[String]) -> Result<BumpArgs, String> {
    let mut target = None;
    let mut ocr_kind = None;
    let mut version = None;
    for argument in arguments {
        let parsed_target = match argument.as_str() {
            "--storage" => Some(BumpTarget::Storage),
            "--auth" => Some(BumpTarget::Auth),
            "--harness" => Some(BumpTarget::Harness),
            "--brain" => Some(BumpTarget::Brain),
            "--squigit" => Some(BumpTarget::Squigit),
            "--cli" => Some(BumpTarget::Cli),
            "--ocr" => Some(BumpTarget::Ocr),
            _ => None,
        };
        if let Some(parsed_target) = parsed_target {
            set_once(&mut target, parsed_target, "bump target")?;
            continue;
        }
        let parsed_kind = match argument.as_str() {
            "--crate" => Some(OcrKind::Crate),
            "--engine" => Some(OcrKind::Engine),
            _ => None,
        };
        if let Some(parsed_kind) = parsed_kind {
            set_once(&mut ocr_kind, parsed_kind, "OCR kind")?;
            continue;
        }
        if argument.starts_with('-') {
            return Err(format!("unknown bump option {argument}\n\n{BUMP_HELP}"));
        }
        set_once(&mut version, argument.clone(), "version")?;
    }

    let target = target.ok_or_else(|| format!("bump requires one target\n\n{BUMP_HELP}"))?;
    let version = version.ok_or_else(|| format!("bump requires VERSION\n\n{BUMP_HELP}"))?;
    if target != BumpTarget::Ocr && ocr_kind.is_some() {
        return Err("--crate and --engine are valid only with --ocr".to_string());
    }
    Ok(BumpArgs {
        target,
        ocr_kind,
        version,
    })
}

fn parse_release(arguments: &[String]) -> Result<ReleaseArgs, String> {
    let mut target = None;
    let mut dry_run = false;
    let mut yes = false;
    for argument in arguments {
        match argument.as_str() {
            "--ocr" => set_once(&mut target, ReleaseTarget::Ocr, "release target")?,
            "--cli" => set_once(&mut target, ReleaseTarget::Cli, "release target")?,
            "--facade" => set_once(&mut target, ReleaseTarget::Facade, "release target")?,
            "--dry-run" if !dry_run => dry_run = true,
            "--yes" if !yes => yes = true,
            option => {
                return Err(format!(
                    "unknown or repeated release option {option}\n\n{RELEASE_HELP}"
                ))
            }
        }
    }
    let target = target.ok_or_else(|| format!("release requires one target\n\n{RELEASE_HELP}"))?;
    Ok(ReleaseArgs {
        target,
        dry_run,
        yes,
    })
}

fn parse_one_flag<T: Copy>(
    command: &str,
    arguments: &[String],
    choices: &[(&str, T)],
) -> Result<T, String> {
    if arguments.len() != 1 {
        return Err(format!("{command} requires exactly one target flag"));
    }
    choices
        .iter()
        .find_map(|(flag, value)| (arguments[0] == *flag).then_some(*value))
        .ok_or_else(|| format!("unknown {command} target {}", arguments[0]))
}

fn parse_optional_flag(command: &str, arguments: &[String], flag: &str) -> Result<bool, String> {
    match arguments {
        [] => Ok(false),
        [argument] if argument == flag => Ok(true),
        [argument] => Err(format!("unknown {command} option {argument}")),
        _ => Err(format!("{command} accepts only {flag}")),
    }
}

fn set_once<T>(slot: &mut Option<T>, value: T, label: &str) -> Result<(), String> {
    if slot.is_some() {
        return Err(format!("{label} may be specified only once"));
    }
    *slot = Some(value);
    Ok(())
}

fn require_empty(command: &str, arguments: &[String]) -> Result<(), String> {
    if arguments.is_empty() {
        Ok(())
    } else {
        Err(format!("{command} does not accept arguments"))
    }
}
