use crate::registry::manifest::Operation;
use crate::registry::Registry;
use crate::{components, console, Runtime};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if args.is_empty() {
            console::render_root_screen(runtime, registry, "release");
            return 0;
        }
        return super::fail(runtime, "release requires a registered component path.");
    }

    if let Err(error) =
        super::parse_optional_yes(args, "release accepts only the optional --yes flag.")
    {
        return super::fail(runtime, &error);
    }
    let component = match super::component_operation(runtime, registry, Operation::Release) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let version = component
        .current_version
        .as_deref()
        .expect("release version exists");
    let tag = match registry.release_tag(component, version) {
        Ok(tag) => tag,
        Err(error) => return super::fail(runtime, &error),
    };
    match components::release(runtime, component, version, &tag) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}
