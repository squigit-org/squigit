use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, version: &str, tag: &str) -> XtaskResult {
    match component.manifest.operations.release.handler.as_str() {
        "cli-release" => release_cli(runtime, version, tag),
        "desktop-release" => release_desktop(runtime, version, tag),
        "renderer-release" => release_renderer(runtime, version, tag),
        handler => Err(format!("unknown app release handler '{handler}'")),
    }
}

fn release_renderer(runtime: &Runtime, version: &str, tag: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Tag the renderer package release for its consuming desktop application.
    **************************/

    runtime.success(&format!("[mock] releasing Renderer {version}"));
    println!("  tag: {tag}");
    Ok(())
}

fn release_cli(runtime: &Runtime, version: &str, tag: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Package, verify, tag, and publish the end-user command-line application.
    **************************/

    runtime.success(&format!("[mock] releasing CLI {version}"));
    println!("  tag: {tag}");
    Ok(())
}

fn release_desktop(runtime: &Runtime, version: &str, tag: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Package, verify, sign, tag, and publish the end-user desktop application.
    **************************/

    runtime.success(&format!("[mock] releasing Desktop {version}"));
    println!("  tag: {tag}");
    Ok(())
}
