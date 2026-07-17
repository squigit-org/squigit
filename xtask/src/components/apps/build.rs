use crate::components::BuildOptions;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, options: &BuildOptions<'_>) -> XtaskResult {
    match component.name() {
        "renderer" => build_renderer(runtime, component, options),
        "desktop" => {
            runtime.note("Desktop build is coming soon.");
            Ok(())
        }
        "cli" => {
            runtime.note("CLI build is coming soon.");
            Ok(())
        }
        name => Err(format!("unknown application build target '{name}'")),
    }
}

fn build_renderer(
    runtime: &Runtime,
    component: &Component,
    options: &BuildOptions<'_>,
) -> XtaskResult {
    let commit_sha = options
        .commit_sha
        .ok_or_else(|| "Renderer build requires Git commit identity".to_string())?;
    super::dev::ensure_node_dependencies(runtime, &component.directory)?;
    let mut command = super::dev::npm_command();
    command
        .args(["run", "build"])
        .current_dir(&component.directory)
        .env("VITE_COMMIT_SHA", commit_sha);
    super::dev::run_foreground(&mut command, "npm run build")?;
    runtime.success("Renderer build complete.");
    Ok(())
}
