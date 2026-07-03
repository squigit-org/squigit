use crate::components::BuildOptions;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, options: &BuildOptions<'_>) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Build the selected application and collect its distributable artifacts.
    **************************/

    runtime.success(&format!("[mock] building {}", component.name()));
    if component.manifest.operations.build.requires_commit_sha {
        println!(
            "  commit: {}",
            options
                .commit_sha
                .ok_or_else(|| "build requires Git commit identity".to_string())?
        );
    }
    Ok(())
}
