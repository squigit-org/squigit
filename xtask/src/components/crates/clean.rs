use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Remove build artifacts owned by the selected Rust crate.
    **************************/

    runtime.success(&format!("[mock] cleaning {}", component.name()));
    Ok(())
}
