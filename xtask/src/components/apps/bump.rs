use crate::commands::bump::{apply, ChangelogMode};
use crate::registry::manifest::VersionScheme;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::path::PathBuf;

pub fn run(
    runtime: &Runtime,
    component: &Component,
    version: &str,
    files: &[PathBuf],
) -> XtaskResult {
    let changelog_mode = match component.manifest.version.scheme {
        VersionScheme::Calver => ChangelogMode::Heading,
        VersionScheme::Semver => ChangelogMode::Tbd,
        VersionScheme::None => ChangelogMode::None,
    };
    apply(
        runtime,
        component.display_name(),
        version,
        files,
        changelog_mode,
    )
}
