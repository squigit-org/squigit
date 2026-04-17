// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Result};

use crate::commands::check::CheckCommandOptions;
use crate::commands::test::TestCommandOptions;

#[derive(Debug, Clone, PartialEq, Eq)]
enum ParsedInvocation {
    ListRoot,
    Category {
        category: String,
        tail: Vec<String>,
        list: bool,
        all: bool,
    },
}

pub fn run(options: TestCommandOptions) -> Result<()> {
    run_internal(
        Operation::Test,
        InvocationOptions {
            list: options.list,
            all: options.all,
            path: options.path,
        },
    )
}

pub fn run_check(options: CheckCommandOptions) -> Result<()> {
    run_internal(
        Operation::Check,
        InvocationOptions {
            list: options.list,
            all: false,
            path: options.path,
        },
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Operation {
    Test,
    Check,
}

#[derive(Debug, Clone)]
struct InvocationOptions {
    list: bool,
    all: bool,
    path: Vec<String>,
}

fn run_internal(operation: Operation, options: InvocationOptions) -> Result<()> {
    match parse_invocation(options)? {
        ParsedInvocation::ListRoot => {
            let (title, entries): (&str, &[&str]) = match operation {
                Operation::Test => ("tests", &["apps", "crates", "sidecars"]),
                Operation::Check => ("check", &["apps", "sidecars"]),
            };

            print_group(title, entries);
            Ok(())
        }
        ParsedInvocation::Category {
            category,
            tail,
            list,
            all,
        } => match operation {
            Operation::Test => match category.as_str() {
                "apps" => super::apps::run(list, &tail),
                "crates" => super::crates::run(list, all, &tail),
                "sidecars" => super::sidecars::run(list, &tail),
                other => bail!(
                    "Unknown test category '{}'. Run `cargo xtask test --list`.",
                    other
                ),
            },
            Operation::Check => match category.as_str() {
                "apps" | "sidecars" => super::check::run(list, &category, &tail),
                other => bail!(
                    "Unknown check category '{}'. Run `cargo xtask check --list`.",
                    other
                ),
            },
        },
    }
}

pub fn print_group(title: &str, entries: &[&str]) {
    println!("[{}]", title);
    for entry in entries {
        println!("- {}", entry);
    }
}

fn parse_invocation(options: InvocationOptions) -> Result<ParsedInvocation> {
    if options.path.is_empty() {
        if options.list {
            return Ok(ParsedInvocation::ListRoot);
        }

        bail!("Missing command path. Run with `--list` to see available paths.");
    }

    Ok(ParsedInvocation::Category {
        category: options.path[0].clone(),
        tail: options.path[1..].to_vec(),
        list: options.list,
        all: options.all,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_invocation, run, InvocationOptions, ParsedInvocation};
    use crate::commands::test::TestCommandOptions;

    fn parse_options(list: bool, path: &[&str]) -> InvocationOptions {
        InvocationOptions {
            list,
            all: false,
            path: path.iter().map(|token| token.to_string()).collect(),
        }
    }

    fn run_options(list: bool, path: &[&str]) -> TestCommandOptions {
        TestCommandOptions {
            list,
            all: false,
            path: path.iter().map(|token| token.to_string()).collect(),
        }
    }

    #[test]
    fn parses_root_list() {
        let parsed = parse_invocation(parse_options(true, &[])).expect("parse root list");
        assert_eq!(parsed, ParsedInvocation::ListRoot);
    }

    #[test]
    fn rejects_empty_non_list_invocation() {
        let err =
            parse_invocation(parse_options(false, &[])).expect_err("expected parse failure");
        assert!(err.to_string().contains("Missing command path"));
    }

    #[test]
    fn parses_apps_auth_login_route() {
        let parsed = parse_invocation(parse_options(false, &["apps", "auth", "login"]))
            .expect("parse apps auth login");
        assert_eq!(
            parsed,
            ParsedInvocation::Category {
                category: "apps".to_string(),
                tail: vec!["auth".to_string(), "login".to_string()],
                list: false,
                all: false,
            }
        );
    }

    #[test]
    fn rejects_legacy_flag_style_category_tokens() {
        let err = run(run_options(false, &["--apps", "--auth", "login"]))
            .expect_err("expected unknown category");
        assert!(err.to_string().contains("Unknown test category '--apps'"));
    }
}
