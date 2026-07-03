use crate::registry::manifest::SetupUi;
use crate::registry::Registry;
use crate::{workspace, Runtime};
use std::io::{self, IsTerminal, Write};
use std::thread;
use std::time::Duration;

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    let yes = match super::parse_optional_yes(args, "setup accepts only the optional --yes flag.") {
        Ok(yes) => yes,
        Err(error) => return super::fail(runtime, &error),
    };

    let ui = setup_ui(registry);
    runtime.heading(&ui.title);
    println!("\n{}", ui.checking);
    let stages = registry.setup_stages();
    if stages.is_empty() {
        println!("  {}", ui.empty_notice);
        return 0;
    }
    for stage in &stages {
        print_status(runtime, &stage.requirement);
    }
    println!("\n{}", ui.install_notice);
    if let Some(notice) = &ui.scope_notice {
        println!("{notice}");
    }

    if !yes {
        println!();
        match runtime.confirm(&ui.prompt) {
            Ok(true) => {}
            Ok(false) => {
                runtime.note(&ui.declined);
                return 0;
            }
            Err(error) => {
                return super::fail(runtime, &format!("Could not read confirmation: {error}"))
            }
        }
    }

    let mut succeeded = 0;
    let mut failed = 0;
    for stage in stages {
        match workspace::setup::run_stage(runtime, stage) {
            Ok(()) => succeeded += 1,
            Err(error) => {
                failed += 1;
                runtime.error(&format!("setup {}: {error}", stage.name));
            }
        }
    }
    super::print_summary("Setup", succeeded, failed);
    i32::from(failed > 0)
}

fn setup_ui(registry: &Registry) -> &SetupUi {
    registry
        .current_target()
        .map_or(&registry.root.ui.setup, |component| {
            &component.manifest.ui.setup
        })
}

fn print_status(runtime: &Runtime, requirement: &str) {
    match requirement {
        "node" => {
            println!("  {:<20} {}", "node", runtime.console.green("ready"));
            println!("  {:<20} {}", "pnpm", runtime.console.red("missing"));
        }
        "python" => println!("  {:<20} {}", "python", runtime.console.green("ready")),
        "cmake" => println!("  {:<20} {}", "cmake", runtime.console.red("missing")),
        "qt" => print_spinner(runtime),
        _ => {}
    }
}

fn print_spinner(runtime: &Runtime) {
    if io::stdout().is_terminal() {
        for frame in ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"] {
            print!("\r  {:<20} {}", "qt/qml", runtime.console.cyan(frame));
            let _ = io::stdout().flush();
            thread::sleep(Duration::from_millis(70));
        }
    }
    println!("\r  {:<20} {}", "qt/qml", runtime.console.cyan("⣻"));
}
