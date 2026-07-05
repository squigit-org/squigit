pub mod build;
pub mod bump;
pub mod clean;
pub mod crypto;
pub mod dev;
pub mod doctor;
pub mod live;
pub mod release;
pub mod test;

use crate::registry::manifest::Operation;
use crate::registry::{Component, Registry};
use crate::{console, error, Runtime};

pub fn dispatch(runtime: &mut Runtime, registry: &Registry, args: &[String]) -> i32 {
    if args.is_empty() {
        console::render_menu(runtime, registry);
        return 0;
    }

    let tail = &args[1..];
    match args[0].as_str() {
        "dev" => dev::run(runtime, registry, tail),
        "doctor" => doctor::run(runtime, registry, tail),
        "build" => build::run(runtime, registry, tail),
        "test" => test::run(runtime, registry, tail),
        "clean" => clean::run(runtime, registry, tail),
        "bump" => bump::run(runtime, registry, tail),
        "release" => release::run(runtime, registry, tail),
        "live" => live::run(runtime, registry, tail),
        "crypto" => crypto::run(runtime, registry, tail),
        unknown => fail(runtime, &error::unknown_command(unknown)),
    }
}

pub fn accepts_component_path(command: &str) -> bool {
    matches!(
        command,
        "dev"
            | "doctor"
            | "build"
            | "test"
            | "clean"
            | "bump"
            | "release"
            | "live"
            | "crypto"
    )
}

pub fn fail(runtime: &Runtime, message: &str) -> i32 {
    runtime.error(message);
    1
}

pub fn component_operation<'a>(
    runtime: &Runtime,
    registry: &'a Registry,
    operation: Operation,
) -> Result<&'a Component, i32> {
    let Some(component) = registry.current_target() else {
        return Err(fail(
            runtime,
            &error::component_only_command(operation.name()),
        ));
    };
    if !component.supports(operation) {
        return Err(disabled(runtime, component, operation.name()));
    }
    Ok(component)
}

pub fn disabled(runtime: &Runtime, component: &Component, command: &str) -> i32 {
    fail(
        runtime,
        &error::command_disabled(
            command,
            component.display_name(),
            &runtime.relative_path(&component.directory),
        ),
    )
}

pub fn root_only(runtime: &Runtime, registry: &Registry, command: &str) -> Result<(), i32> {
    if registry.is_repository() {
        Ok(())
    } else {
        Err(fail(runtime, &error::root_only_command(command)))
    }
}



pub fn print_summary(label: &str, succeeded: usize, failed: usize) {
    println!("\n{label} summary: {succeeded} succeeded, {failed} failed");
}

pub fn parse_optional_yes(args: &[String], error: &str) -> Result<bool, String> {
    match args {
        [] => Ok(false),
        [value] if value == "--yes" => Ok(true),
        _ => Err(error.to_string()),
    }
}
