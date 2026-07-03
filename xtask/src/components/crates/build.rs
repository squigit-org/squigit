use crate::components::BuildOptions;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, _options: &BuildOptions<'_>) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Build the selected Rust crate and collect its expected artifacts.
    **************************/

    runtime.success(&format!("[mock] building {}", component.name()));
    Ok(())
}
