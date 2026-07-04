use crate::commands::test as test_command;
use crate::components::TestSelection;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, selection: &TestSelection) -> XtaskResult {
    test_command::run_node(runtime, component, selection)
}
