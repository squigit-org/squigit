use crate::{Runtime, XtaskResult};
use std::path::PathBuf;

pub fn bump_root(runtime: &Runtime, version: &str, files: &[PathBuf]) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Update VERSION and the root changelog to today's CalVer release value.
    **************************/

    runtime.success(&format!("[mock] bumping repository to {version}"));
    println!("  date: {}", runtime.today_date());
    for file in files {
        println!("  would update: {}", runtime.relative_path(file));
    }
    Ok(())
}
