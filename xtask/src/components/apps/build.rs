use crate::components::BuildOptions;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::env;
use std::process::Command;

pub fn run(runtime: &Runtime, component: &Component, options: &BuildOptions<'_>) -> XtaskResult {
    match component.name() {
        "renderer" => build_renderer(runtime, component, options),
        "legacy-tauri" => build_legacy_tauri(runtime, component, options),
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

fn build_legacy_tauri(
    runtime: &Runtime,
    component: &Component,
    options: &BuildOptions<'_>,
) -> XtaskResult {
    let commit_sha = options
        .commit_sha
        .ok_or_else(|| "Legacy Tauri build requires Git commit identity".to_string())?;
    super::dev::ensure_tauri_dependencies(runtime, component)?;

    let renderer = runtime.repo_root.join("apps/renderer");
    super::dev::ensure_node_dependencies(runtime, &renderer)?;
    let tauri = tauri_cli(&renderer);
    if !tauri.is_file() {
        return Err(format!(
            "Tauri CLI is missing at {}. Install Renderer dependencies first.",
            tauri.display()
        ));
    }

    let mut command = Command::new(&tauri);
    command.arg("build");
    if cfg!(target_os = "linux") {
        command.args(["--bundles", "appimage"]);
    } else if cfg!(target_os = "windows") {
        command.args(["--bundles", "nsis"]);
    } else if cfg!(target_os = "macos") {
        command.args(["--bundles", "dmg"]);
    }
    command
        .current_dir(&component.directory)
        .env("VITE_COMMIT_SHA", commit_sha);

    if cfg!(target_os = "linux") {
        command
            .env("APPIMAGE_EXTRACT_AND_RUN", "1")
            .env("NO_STRIP", "true");
    }
    if tauri_debug_enabled() {
        command
            .env("RUST_BACKTRACE", "full")
            .env("RUST_LOG", "tauri_cli=trace,tauri_bundler=trace")
            .env("TAURI_LOG_LEVEL", "debug")
            .env("TAURI_BUNDLER_DEBUG", "1");
        runtime.note("Tauri debug mode enabled.");
    }

    super::dev::run_foreground(&mut command, "tauri build")?;
    runtime.success("Archived Tauri build complete.");
    Ok(())
}

fn tauri_cli(renderer: &std::path::Path) -> std::path::PathBuf {
    let bin = renderer.join("node_modules").join(".bin");
    if cfg!(windows) {
        bin.join("tauri.cmd")
    } else {
        bin.join("tauri")
    }
}

fn tauri_debug_enabled() -> bool {
    parse_bool_env("SQUIGIT_TAURI_DEBUG") || parse_bool_env("CI")
}

fn parse_bool_env(name: &str) -> bool {
    env::var(name)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::tauri_cli;
    use std::path::Path;

    #[test]
    fn tauri_cli_comes_from_renderer_dependencies() {
        let path = tauri_cli(Path::new("/repo/apps/renderer"));
        if cfg!(windows) {
            assert_eq!(
                path,
                Path::new("/repo/apps/renderer/node_modules/.bin/tauri.cmd")
            );
        } else {
            assert_eq!(
                path,
                Path::new("/repo/apps/renderer/node_modules/.bin/tauri")
            );
        }
    }
}
