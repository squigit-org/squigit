use crate::components::BuildOptions;
use crate::registry::manifest::Operation;
use crate::registry::Registry;
use crate::{components, console, Runtime, XtaskResult};
use std::path::Path;
use std::process::Command;

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if args.is_empty() {
            console::render_root_screen(runtime, registry, "build");
            return 0;
        }
        return super::fail(runtime, "build requires a registered component path.");
    }

    let component = match super::component_operation(runtime, registry, Operation::Build) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let handler = component.manifest.operations.build.handler.as_str();
    let archived_yes = if component.archived() {
        match super::parse_optional_yes(args, "archived build accepts only --yes.") {
            Ok(yes) => yes,
            Err(error) => return super::fail(runtime, &error),
        }
    } else {
        false
    };
    let operation_args = if component.archived() { &[][..] } else { args };
    let (native, measure_payload) = match handler {
        "qt-capture" => match operation_args {
            [] => (false, false),
            [value] if value == "--native" => (true, false),
            _ => return super::fail(runtime, "Qt Capture build accepts only --native."),
        },
        "paddle-ocr" => {
            let yes = match super::parse_optional_yes(
                operation_args,
                "Paddle OCR build accepts only --yes.",
            ) {
                Ok(yes) => yes,
                Err(error) => return super::fail(runtime, &error),
            };
            let measure = if yes {
                true
            } else {
                let prompt = console::component_prompt(registry, "build");
                match console::render_prompt(runtime, prompt, &[]) {
                    Ok(answer) => answer,
                    Err(error) => {
                        return super::fail(
                            runtime,
                            &format!("Could not read confirmation: {error}"),
                        )
                    }
                }
            };
            (false, measure)
        }
        _ if operation_args.is_empty() => (false, false),
        _ => return super::fail(runtime, "build does not accept arguments in this context."),
    };
    match super::confirm_archived(runtime, registry, component, archived_yes) {
        Ok(true) => {}
        Ok(false) => {
            console::declined(runtime, console::component_prompt(registry, "archived"));
            return 0;
        }
        Err(code) => return code,
    }
    let sha = if component.manifest.operations.build.requires_commit_sha {
        match git_head(&registry.repo_root) {
            Ok(sha) => Some(sha),
            Err(error) => return super::fail(runtime, &error),
        }
    } else {
        None
    };
    let options = BuildOptions {
        commit_sha: sha.as_deref(),
        native,
        measure_payload,
    };
    match components::build(runtime, component, &options) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

fn git_head(repo_root: &Path) -> XtaskResult<String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(repo_root)
        .output()
        .map_err(|error| format!("Could not read Git HEAD: {error}"))?;
    if !output.status.success() {
        return Err(
            "Could not read Git HEAD for a build that requires commit identity.".to_string(),
        );
    }
    let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sha.is_empty() {
        Err("Git HEAD resolved to an empty commit identity.".to_string())
    } else {
        Ok(sha)
    }
}
