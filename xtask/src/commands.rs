pub mod build;
pub mod bump;
pub mod clean;
pub mod crypto;
pub mod dev;
pub mod doctor;
pub mod live;
pub mod release;
pub mod test;

use crate::registry::manifest::{Operation, UiDoc};
use crate::registry::{Component, Registry};
use crate::{console, error, Runtime};

pub fn strip_help_flags(args: &[String]) -> (Vec<String>, bool) {
    let mut found = false;
    let args = args
        .iter()
        .filter_map(|arg| {
            if matches!(arg.as_str(), "--help" | "-h") {
                found = true;
                None
            } else {
                Some(arg.clone())
            }
        })
        .collect();
    (args, found)
}

pub fn dispatch(runtime: &mut Runtime, registry: &Registry, args: &[String], help: bool) -> i32 {
    if help {
        return dispatch_help(runtime, registry, args);
    }

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

enum HelpScreen {
    Menu,
    Screen(&'static str),
}

fn dispatch_help(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if let Err(code) = validate_help(runtime, registry, args) {
        return code;
    }
    if !registry.is_repository() && !args.is_empty() {
        let doc = help_doc(registry, args);
        console::render_doc_pointer(runtime, &doc);
        return 0;
    }

    match help_screen(args) {
        Some(HelpScreen::Menu) => console::render_menu(runtime, registry),
        Some(HelpScreen::Screen(route)) => console::render_root_screen(runtime, registry, route),
        None => {
            let doc = help_doc(registry, args);
            console::render_doc_pointer(runtime, &doc);
        }
    }
    0
}

fn validate_help(runtime: &Runtime, registry: &Registry, args: &[String]) -> Result<(), i32> {
    let Some(command) = args.first().map(String::as_str) else {
        return Ok(());
    };

    if registry.is_repository() {
        validate_repository_help(runtime, registry, command, &args[1..])
    } else {
        validate_component_help(runtime, registry, command)
    }
}

fn validate_repository_help(
    runtime: &Runtime,
    registry: &Registry,
    command: &str,
    args: &[String],
) -> Result<(), i32> {
    let Some(operation) = registry.root_operation(command) else {
        return Err(fail(runtime, &error::unknown_command(command)));
    };
    if !operation.enabled {
        return Err(fail(runtime, &error::unknown_command(command)));
    }
    match command {
        "live" => validate_live_help(runtime, args),
        "crypto" => validate_crypto_help(runtime, args),
        _ => Ok(()),
    }
}

fn validate_component_help(
    runtime: &Runtime,
    registry: &Registry,
    command: &str,
) -> Result<(), i32> {
    if matches!(command, "live" | "crypto") {
        return Err(fail(runtime, &error::root_only_command(command)));
    }
    let Some(operation) = Operation::parse(command) else {
        return Err(fail(runtime, &error::unknown_command(command)));
    };
    component_operation(runtime, registry, operation).map(|_| ())
}

fn validate_live_help(runtime: &Runtime, args: &[String]) -> Result<(), i32> {
    let Some(workflow) = args.first().map(String::as_str) else {
        return Ok(());
    };
    match workflow {
        "auth" => validate_live_auth_help(runtime, &args[1..]),
        "brain" => validate_live_brain_help(runtime, &args[1..]),
        "ocr" => validate_live_ocr_help(runtime, &args[1..]),
        "capture" => validate_live_capture_help(runtime, &args[1..]),
        unknown => Err(fail(
            runtime,
            &format!("Unknown live workflow '{unknown}'."),
        )),
    }
}

fn validate_live_auth_help(runtime: &Runtime, args: &[String]) -> Result<(), i32> {
    let Some(action) = args.first().map(String::as_str) else {
        return Ok(());
    };
    if matches!(
        action,
        "login" | "signup" | "logout" | "profiles" | "remove"
    ) {
        Ok(())
    } else {
        Err(fail(runtime, "Invalid live auth arguments."))
    }
}

fn validate_live_brain_help(runtime: &Runtime, args: &[String]) -> Result<(), i32> {
    let Some(action) = args.first().map(String::as_str) else {
        return Ok(());
    };
    if matches!(action, "analyze" | "prompt" | "threads") {
        Ok(())
    } else {
        Err(fail(runtime, "Invalid live brain arguments."))
    }
}

fn validate_live_ocr_help(runtime: &Runtime, args: &[String]) -> Result<(), i32> {
    let Some(action) = args.first().map(String::as_str) else {
        return Ok(());
    };
    if matches!(action, "analyze" | "download" | "models") {
        Ok(())
    } else {
        Err(fail(runtime, "Invalid live OCR arguments."))
    }
}

fn validate_live_capture_help(runtime: &Runtime, args: &[String]) -> Result<(), i32> {
    let Some(mode) = args.first().map(String::as_str) else {
        return Ok(());
    };
    if matches!(mode, "traditional" | "squiggle") {
        Ok(())
    } else {
        Err(fail(
            runtime,
            "Capture mode must be traditional or squiggle.",
        ))
    }
}

fn validate_crypto_help(runtime: &Runtime, args: &[String]) -> Result<(), i32> {
    let Some(action) = args.first().map(String::as_str) else {
        return Ok(());
    };
    if matches!(action, "keygen" | "sign") {
        Ok(())
    } else {
        Err(fail(runtime, &format!("Unknown crypto action '{action}'.")))
    }
}

fn help_screen(args: &[String]) -> Option<HelpScreen> {
    match args {
        [] => Some(HelpScreen::Menu),
        [command] => match command.as_str() {
            "dev" => Some(HelpScreen::Screen("dev")),
            "build" => Some(HelpScreen::Screen("build")),
            "release" => Some(HelpScreen::Screen("release")),
            "live" => Some(HelpScreen::Screen("live")),
            "crypto" => Some(HelpScreen::Screen("crypto")),
            _ => None,
        },
        [command, subject] => match (command.as_str(), subject.as_str()) {
            ("live", "auth") => Some(HelpScreen::Screen("live.auth")),
            ("live", "brain") => Some(HelpScreen::Screen("live.brain")),
            ("live", "ocr") => Some(HelpScreen::Screen("live.ocr")),
            ("live", "capture") => Some(HelpScreen::Screen("live.capture")),
            ("crypto", "sign") => Some(HelpScreen::Screen("crypto.sign")),
            _ => None,
        },
        _ => None,
    }
}

fn help_doc(registry: &Registry, args: &[String]) -> UiDoc {
    let root_doc = registry.root.ui.menu.doc.clone().unwrap_or_else(|| UiDoc {
        path: "docs/03-development/DEVELOPMENT.md".to_string(),
        topic: "xtask".to_string(),
    });
    let Some(command) = args.first().map(String::as_str) else {
        return root_doc;
    };
    if registry.root_operation(command).is_some() {
        doc_with_topic(&root_doc, command)
    } else {
        root_doc
    }
}

fn doc_with_topic(doc: &UiDoc, topic: &str) -> UiDoc {
    UiDoc {
        path: doc.path.clone(),
        topic: topic.to_string(),
    }
}

pub fn accepts_component_path(command: &str) -> bool {
    matches!(
        command,
        "dev" | "doctor" | "build" | "test" | "clean" | "bump" | "release" | "live" | "crypto"
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
