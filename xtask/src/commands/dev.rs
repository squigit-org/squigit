use anyhow::Result;
use xtask::{run_cmd, run_cmd_with_node_bin, ui_dir, tauri_dir};

pub fn run(cmd: &str) -> Result<()> {
    let ui = ui_dir();
    let app = tauri_dir();
    let node_bin = ui.join("node_modules").join(".bin");

    if !ui.join("node_modules").exists() {
        println!("\nInstalling npm dependencies...");
        run_cmd("npm", &["install"], &ui)?;
    }

    println!("\nRunning: tauri {}", cmd);
    run_cmd_with_node_bin("tauri", &[cmd], &app, &node_bin)?;

    Ok(())
}
