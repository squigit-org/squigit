use crate::commands::bump::{apply, ChangelogMode};
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::path::PathBuf;

pub fn run(
    runtime: &Runtime,
    component: &Component,
    version: &str,
    files: &[PathBuf],
) -> XtaskResult {
    apply(
        runtime,
        component.display_name(),
        version,
        files,
        ChangelogMode::None,
    )
}
