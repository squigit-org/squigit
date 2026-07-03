use crate::components::TestSelection;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, selection: &TestSelection) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Run only the selected integration-test files from the Rust crate's tests directory.
    **************************/

    runtime.success(&format!(
        "[mock] testing {}{}",
        component.name(),
        selection.label
    ));
    for path in &selection.paths {
        println!("  test: {}", path.display());
    }
    Ok(())
}
