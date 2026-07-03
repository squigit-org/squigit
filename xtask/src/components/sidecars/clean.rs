use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Remove generated native, packaging, and test artifacts owned by the selected sidecar.
    **************************/

    runtime.success(&format!("[mock] cleaning {}", component.name()));
    Ok(())
}
