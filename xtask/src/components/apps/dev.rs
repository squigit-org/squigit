use crate::registry::manifest::Operation;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const RENDERER_PORT: u16 = 1420;

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    match component.operation(Operation::Dev).handler.as_str() {
        "cli-dev" => run_cli(runtime),
        "renderer-dev" => run_renderer(runtime, component),
        "desktop-dev" => run_desktop(runtime, component),
        handler => Err(format!("unknown app dev handler '{handler}'")),
    }
}

fn run_cli(runtime: &Runtime) -> XtaskResult {
    runtime.note("CLI development mode is coming soon.");
    Ok(())
}

fn run_renderer(runtime: &Runtime, component: &Component) -> XtaskResult {
    ensure_node_dependencies(runtime, &component.directory)?;
    let mut command = npm_command();
    command
        .args(["run", "dev"])
        .current_dir(&component.directory);
    run_foreground(&mut command, "npm run dev")
}

fn run_desktop(runtime: &Runtime, component: &Component) -> XtaskResult {
    require_populated_directory(
        &component.directory.join("binaries"),
        "Desktop sidecar binaries are missing. Build and package the sidecars before running dev.",
    )?;

    let renderer = runtime.repo_root.join("apps/renderer");
    ensure_node_dependencies(runtime, &renderer)?;
    ensure_node_dependencies(runtime, &component.directory)?;

    if renderer_is_ready() {
        return Err(format!(
            "Renderer port {RENDERER_PORT} is already in use. Stop the existing process and retry."
        ));
    }

    println!("\nStarting Renderer for Electron...");
    let mut vite_command = npm_command();
    vite_command
        .args(["run", "dev"])
        .current_dir(&renderer)
        .env("VITE_PLATFORM", "electron");
    let vite_child = spawn_streaming(&mut vite_command, "npm run dev")?;
    let mut vite = ManagedChild::new(vite_child);
    wait_for_renderer(&mut vite)?;

    println!("\nBuilding the Electron main process...");
    let mut build_command = npm_command();
    build_command
        .args(["run", "build"])
        .current_dir(&component.directory);
    run_foreground(&mut build_command, "npm run build")?;

    let electron_cli = component.directory.join("node_modules/electron/cli.js");
    if !electron_cli.is_file() {
        return Err(format!(
            "Electron is not installed at {}. Run npm install in {}.",
            electron_cli.display(),
            component.directory.display()
        ));
    }

    println!("\nStarting Electron...");
    let mut electron_command = Command::new("node");
    electron_command
        .arg(&electron_cli)
        .args([".", "--no-sandbox"])
        .current_dir(&component.directory)
        .env("NODE_ENV", "development")
        .env_remove("ELECTRON_RUN_AS_NODE");
    let result = run_foreground(
        &mut electron_command,
        &format!("node {} . --no-sandbox", electron_cli.display()),
    );
    vite.stop();
    result
}

pub(super) fn ensure_node_dependencies(runtime: &Runtime, directory: &Path) -> XtaskResult {
    if directory.join("node_modules").is_dir() {
        return Ok(());
    }

    runtime.note(&format!(
        "Installing Node.js dependencies in {}...",
        runtime.relative_path(directory)
    ));
    let mut command = npm_command();
    command.args(["install"]).current_dir(directory);
    run_foreground(&mut command, "npm install")
}

pub(super) fn npm_command() -> Command {
    #[cfg(windows)]
    {
        Command::new("npm.cmd")
    }
    #[cfg(not(windows))]
    {
        Command::new("npm")
    }
}

pub(super) fn run_foreground(command: &mut Command, display: &str) -> XtaskResult {
    println!("  $ {display}");
    let status = command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start '{display}': {error}"))?;
    command_result(display, status)
}

fn spawn_streaming(command: &mut Command, display: &str) -> XtaskResult<Child> {
    println!("  $ {display}");
    command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Could not start '{display}': {error}"))
}

fn command_result(display: &str, status: ExitStatus) -> XtaskResult {
    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("'{display}' exited with status {code}."))
    } else {
        Err(format!("'{display}' was terminated by a signal."))
    }
}

fn renderer_is_ready() -> bool {
    TcpStream::connect(("127.0.0.1", RENDERER_PORT)).is_ok()
}

fn wait_for_renderer(child: &mut ManagedChild) -> XtaskResult {
    println!("Waiting for Renderer on http://localhost:{RENDERER_PORT}...");
    let started = Instant::now();
    let timeout = Duration::from_secs(15);

    loop {
        if renderer_is_ready() {
            println!("Renderer is ready.");
            return Ok(());
        }
        if let Some(status) = child
            .child_mut()
            .try_wait()
            .map_err(|error| format!("Could not monitor Renderer: {error}"))?
        {
            return command_result("npm run dev", status)
                .and(Err("Renderer exited before becoming ready.".to_string()));
        }
        if started.elapsed() >= timeout {
            return Err(format!(
                "Renderer did not start on port {RENDERER_PORT} within 15 seconds."
            ));
        }
        thread::sleep(Duration::from_millis(250));
    }
}

struct ManagedChild {
    child: Option<Child>,
}

impl ManagedChild {
    fn new(child: Child) -> Self {
        Self { child: Some(child) }
    }

    fn child_mut(&mut self) -> &mut Child {
        self.child.as_mut().expect("managed child exists")
    }

    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        self.stop();
    }
}

fn require_populated_directory(path: &Path, message: &str) -> XtaskResult {
    let populated = path
        .read_dir()
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);
    if populated {
        Ok(())
    } else {
        Err(format!("{message} Expected files in {}.", path.display()))
    }
}
