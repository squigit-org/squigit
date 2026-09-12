// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod app;
mod args;
mod commands;
mod state;
mod tasks;
mod ui;

use app::{App, Control};
use args::{CliArgs, HELP};
use crossterm::event;
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use state::NoticeKind;
use std::fs::OpenOptions;
use std::io::{self, Stdout};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

type TuiTerminal = Terminal<CrosstermBackend<Stdout>>;

struct TerminalSession {
    terminal: TuiTerminal,
    active: bool,
}

impl TerminalSession {
    fn enter() -> io::Result<Self> {
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        if let Err(error) = execute!(stdout, EnterAlternateScreen) {
            let _ = disable_raw_mode();
            return Err(error);
        }
        let terminal = Terminal::new(CrosstermBackend::new(stdout))?;
        Ok(Self {
            terminal,
            active: true,
        })
    }

    fn suspend(&mut self) -> io::Result<()> {
        if !self.active {
            return Ok(());
        }
        disable_raw_mode()?;
        execute!(self.terminal.backend_mut(), LeaveAlternateScreen)?;
        self.terminal.show_cursor()?;
        self.active = false;
        Ok(())
    }

    fn resume(&mut self) -> io::Result<()> {
        if self.active {
            return Ok(());
        }
        enable_raw_mode()?;
        execute!(self.terminal.backend_mut(), EnterAlternateScreen)?;
        self.terminal.clear()?;
        self.active = true;
        Ok(())
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        if self.active {
            let _ = disable_raw_mode();
            let _ = execute!(self.terminal.backend_mut(), LeaveAlternateScreen);
            let _ = self.terminal.show_cursor();
        }
    }
}

#[tokio::main]
async fn main() {
    let code = match run().await {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("squigit: {error}");
            1
        }
    };
    std::process::exit(code);
}

async fn run() -> Result<(), String> {
    let arguments = CliArgs::parse(std::env::args().skip(1))?;
    if arguments.help {
        println!("{HELP}");
        return Ok(());
    }
    if arguments.version {
        println!("squigit {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    if let Some(config_root) = arguments.config_root() {
        let config_root = absolute_path(config_root)?;
        std::fs::create_dir_all(&config_root).map_err(|error| {
            format!(
                "could not create config root {}: {error}",
                config_root.display()
            )
        })?;
        std::env::set_var("SQUIGIT_CONFIG_DIR", config_root);
    }

    let install_script_error = squigit::services::ensure_ocr_install_script().err();
    let cwd = std::env::current_dir()
        .map_err(|error| format!("could not read the current directory: {error}"))?
        .canonicalize()
        .map_err(|error| format!("could not resolve the current directory: {error}"))?;
    let color = !arguments.no_color && std::env::var_os("NO_COLOR").is_none();
    let mut app = App::load(cwd, color, arguments.image.is_some())?;
    if let Some(error) = install_script_error {
        app.state.set_notice(
            NoticeKind::Warning,
            format!("Could not repair the OCR installer: {error}"),
        );
    }
    if let Some(image) = arguments.image {
        app.start_image(absolute_path(image)?);
    }

    let mut terminal = TerminalSession::enter().map_err(|error| error.to_string())?;
    while !app.state.quit {
        app.tick();
        terminal
            .terminal
            .draw(|frame| ui::draw(frame, &app.state))
            .map_err(|error| error.to_string())?;
        if event::poll(Duration::from_millis(90)).map_err(|error| error.to_string())? {
            let event = event::read().map_err(|error| error.to_string())?;
            if let event::Event::Key(key) = event {
                if let Some(control) = app.handle_key(key) {
                    handle_control(&mut terminal, &mut app, control)?;
                }
            }
        }
    }
    Ok(())
}

fn handle_control(
    terminal: &mut TerminalSession,
    app: &mut App,
    control: Control,
) -> Result<(), String> {
    match control {
        Control::EditPersonality(path) => {
            terminal.suspend().map_err(|error| error.to_string())?;
            let edit_result = open_editor(&path);
            terminal.resume().map_err(|error| error.to_string())?;
            match edit_result {
                Ok(()) => app
                    .state
                    .set_notice(NoticeKind::Success, "Personality file saved"),
                Err(error) => app.state.set_notice(NoticeKind::Error, error),
            }
        }
    }
    Ok(())
}

fn open_editor(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    const EDITORS: &[&str] = &["notepad", "vim"];
    #[cfg(not(target_os = "windows"))]
    const EDITORS: &[&str] = &["nano", "vim"];

    for editor in EDITORS {
        match Command::new(editor).arg(path).status() {
            Ok(status) if status.success() => return Ok(()),
            Ok(status) => {
                return Err(format!("{editor} exited with status {status}"));
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("could not start {editor}: {error}")),
        }
    }
    Err("no supported editor was found (tried nano/notepad and vim)".to_string())
}

fn absolute_path(path: PathBuf) -> Result<PathBuf, String> {
    if path.is_absolute() {
        return Ok(path);
    }
    std::env::current_dir()
        .map(|directory| directory.join(path))
        .map_err(|error| error.to_string())
}
