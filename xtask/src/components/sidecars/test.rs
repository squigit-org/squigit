use crate::commands::test as test_command;
use crate::components::{TestBackend, TestSelection};
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, selection: &TestSelection) -> XtaskResult {
    match test_command::backend(component) {
        TestBackend::Cargo => test_command::run_cargo(runtime, component, selection),
        TestBackend::LiveOnly => {
            test_command::report_live_only(runtime, component);
            Ok(())
        }
        TestBackend::Node => Err(format!(
            "unexpected Node test backend for {}",
            component.display_name()
        )),
    }
}
