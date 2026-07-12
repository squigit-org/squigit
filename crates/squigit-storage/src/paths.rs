// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";

#[cfg(target_os = "linux")]
const APP_DIR_NAME: &str = "squigit";

#[cfg(not(target_os = "linux"))]
const APP_DIR_NAME: &str = "Squigit";

/// Resolve Squigit's application config root.
///
/// `SQUIGIT_CONFIG_DIR` overrides the OS default with an exact application root. This is used by
/// isolated tooling that must not read or write the installed application's profile data.
pub fn base_config_dir() -> Option<PathBuf> {
    resolve_base_config_dir(
        std::env::var_os(CONFIG_DIR_ENV).map(PathBuf::from),
        dirs::config_dir(),
    )
}

fn resolve_base_config_dir(
    override_dir: Option<PathBuf>,
    system_config_dir: Option<PathBuf>,
) -> Option<PathBuf> {
    override_dir
        .filter(|path| !path.as_os_str().is_empty())
        .or_else(|| system_config_dir.map(|path| path.join(APP_DIR_NAME)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_config_directory_takes_precedence() {
        let override_dir = PathBuf::from("/tmp/squigit-live");
        let system_dir = PathBuf::from("/home/example/.config");

        assert_eq!(
            resolve_base_config_dir(Some(override_dir.clone()), Some(system_dir)),
            Some(override_dir)
        );
    }

    #[test]
    fn empty_override_falls_back_to_the_system_config_directory() {
        let system_dir = PathBuf::from("/home/example/.config");

        assert_eq!(
            resolve_base_config_dir(Some(PathBuf::new()), Some(system_dir.clone())),
            Some(system_dir.join(APP_DIR_NAME))
        );
    }
}
