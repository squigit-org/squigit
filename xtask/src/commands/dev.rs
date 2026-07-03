use crate::registry::manifest::Operation;
use crate::registry::Registry;
use crate::{components, console, Runtime};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if args.is_empty() {
            console::render_root_screen(runtime, registry, "dev");
            return 0;
        }
        return super::fail(runtime, "dev requires a registered component path.");
    }
    let component = match super::component_operation(runtime, registry, Operation::Dev) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let yes = if component.archived() {
        match super::parse_optional_yes(args, "archived dev accepts only --yes.") {
            Ok(yes) => yes,
            Err(error) => return super::fail(runtime, &error),
        }
    } else if args.is_empty() {
        false
    } else {
        return super::fail(runtime, "dev does not accept arguments.");
    };
    match super::confirm_archived(runtime, registry, component, yes) {
        Ok(true) => {}
        Ok(false) => {
            console::declined(runtime, console::component_prompt(registry, "archived"));
            return 0;
        }
        Err(code) => return code,
    }
    match components::dev(runtime, component) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}
