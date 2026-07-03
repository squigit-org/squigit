use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Start the selected application with its development dependencies and stream output.
    **************************/

    runtime.success(&format!(
        "[mock] starting {} development mode",
        component.name()
    ));
    Ok(())
}
