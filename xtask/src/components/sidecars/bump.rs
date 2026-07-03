use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::path::PathBuf;

pub fn run(
    runtime: &Runtime,
    component: &Component,
    version: &str,
    files: &[PathBuf],
) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Update sidecar version sources, changelogs, and shared release metadata.
    **************************/

    runtime.success(&format!("[mock] bumping {} to {version}", component.name()));
    println!("  date: {}", runtime.today_date());
    for file in files {
        println!("  would update: {}", runtime.relative_path(file));
    }
    Ok(())
}
