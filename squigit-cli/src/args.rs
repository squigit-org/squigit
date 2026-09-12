// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

#[derive(Debug, Default)]
pub struct CliArgs {
    pub home: Option<PathBuf>,
    pub image: Option<PathBuf>,
    pub no_color: bool,
    pub help: bool,
    pub version: bool,
}

impl CliArgs {
    pub fn parse(arguments: impl IntoIterator<Item = String>) -> Result<Self, String> {
        let mut parsed = Self::default();
        let mut arguments = arguments.into_iter();
        while let Some(argument) = arguments.next() {
            match argument.as_str() {
                "-h" | "--help" => parsed.help = true,
                "-V" | "--version" => parsed.version = true,
                "--no-color" => parsed.no_color = true,
                "--home" => {
                    let value = arguments
                        .next()
                        .ok_or_else(|| "--home requires a directory".to_string())?;
                    if value.trim().is_empty() {
                        return Err("--home requires a directory".to_string());
                    }
                    parsed.home = Some(PathBuf::from(value));
                }
                "--" => {
                    while let Some(value) = arguments.next() {
                        parsed.set_image(value)?;
                    }
                    break;
                }
                value if value.starts_with('-') => {
                    return Err(format!("unknown option: {value}"));
                }
                value => parsed.set_image(value.to_string())?,
            }
        }
        Ok(parsed)
    }

    pub fn config_root(&self) -> Option<PathBuf> {
        self.home.clone().or_else(|| {
            std::env::var_os("SQUIGIT_HOME")
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
        })
    }

    fn set_image(&mut self, value: String) -> Result<(), String> {
        if self.image.is_some() {
            return Err("squigit accepts one image path".to_string());
        }
        self.image = Some(PathBuf::from(value));
        Ok(())
    }
}

pub const HELP: &str = "Squigit terminal interface

Usage: squigit [OPTIONS] [IMAGE]

Arguments:
  [IMAGE]          Start an image thread immediately

Options:
      --home PATH  Use PATH as the Squigit config root
      --no-color   Disable ANSI colors
  -h, --help       Print help
  -V, --version    Print version

Environment:
  SQUIGIT_HOME       Config root used by the CLI
  SQUIGIT_CONFIG_DIR Shared config root used by every Squigit shell
  NO_COLOR           Disable ANSI colors";
