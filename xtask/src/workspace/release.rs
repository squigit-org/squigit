use crate::commands::bump::{apply, ChangelogMode};
use crate::{Runtime, XtaskResult};
use std::path::PathBuf;

pub fn bump_root(runtime: &Runtime, version: &str, files: &[PathBuf]) -> XtaskResult {
    apply(
        runtime,
        "Repository",
        version,
        files,
        ChangelogMode::RootTbd,
    )
}
