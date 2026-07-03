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

    Update package manifests and shared release metadata to the requested version.
    **************************/

    runtime.success(&format!("[mock] bumping {} to {version}", component.name()));
    println!("  date: {}", runtime.today_date());
    for file in files {
        println!("  would update: {}", runtime.relative_path(file));
    }
    Ok(())
}
