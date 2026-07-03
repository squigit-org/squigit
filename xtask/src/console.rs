use std::env;
use std::io::{self, IsTerminal, Write};

use crate::registry::manifest::{UiMenu, UiPrompt, UiScreen};
use crate::registry::Registry;
use crate::Runtime;

#[derive(Clone, Copy)]
pub struct Console {
    color: bool,
    terminal: bool,
}

impl Console {
    pub fn auto() -> Self {
        let terminal = io::stdout().is_terminal();
        Self {
            color: terminal && env::var_os("NO_COLOR").is_none(),
            terminal,
        }
    }

    pub const fn plain() -> Self {
        Self {
            color: false,
            terminal: false,
        }
    }

    pub fn wrap(self, code: &str, text: &str) -> String {
        if self.color {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_string()
        }
    }

    pub fn green(self, text: &str) -> String {
        self.wrap("32", text)
    }

    pub fn red(self, text: &str) -> String {
        self.wrap("31", text)
    }

    pub fn yellow(self, text: &str) -> String {
        self.wrap("33", text)
    }

    pub fn cyan(self, text: &str) -> String {
        self.wrap("36", text)
    }

    pub fn bold(self, text: &str) -> String {
        self.wrap("1", text)
    }

    pub fn link(self, label: &str, url: &str) -> String {
        if self.terminal {
            format!("\x1b]8;;{url}\x1b\\{label}\x1b]8;;\x1b\\")
        } else {
            label.to_string()
        }
    }
}

impl Runtime {
    pub fn heading(&self, text: &str) {
        println!("{}", self.console.bold(&self.console.cyan(text)));
    }

    pub fn success(&self, text: &str) {
        println!("{}", self.console.green(text));
    }

    pub fn note(&self, text: &str) {
        println!("{}", self.console.yellow(text));
    }

    pub fn error(&self, text: &str) {
        eprintln!("{}", self.console.red(text));
    }

    pub fn confirm(&self, prompt: &str) -> io::Result<bool> {
        print!("{} ", self.console.yellow(prompt));
        io::stdout().flush()?;
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        Ok(matches!(
            input.trim().to_ascii_lowercase().as_str(),
            "y" | "yes"
        ))
    }
}

pub fn render_menu(runtime: &Runtime, registry: &Registry) {
    let menu = menu(registry);
    let vocabulary = &registry.root.ui.vocabulary;

    runtime.heading(&menu.title);
    println!(
        "\n{}\n  {}\n\n{}",
        vocabulary.usage,
        runtime.console.yellow(&menu.usage),
        vocabulary.commands
    );

    let entries = if registry.is_repository() {
        registry
            .root
            .operations
            .iter()
            .filter(|(_, operation)| operation.enabled)
            .map(|(name, operation)| (name, operation.description.as_str()))
            .collect::<Vec<_>>()
    } else if let Some(component) = registry.current_target() {
        crate::registry::manifest::Operation::ALL
            .into_iter()
            .filter_map(|operation| {
                let config = component.operation(operation);
                config
                    .enabled
                    .then_some((operation.name(), config.description.as_str()))
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    print_entries(runtime, &entries);
}

pub fn render_root_screen(runtime: &Runtime, registry: &Registry, route: &str) {
    let screen = registry
        .root
        .ui
        .screens
        .get(route)
        .expect("validated root UI screen exists");
    render_screen(runtime, registry, screen);
}

pub fn render_screen(runtime: &Runtime, registry: &Registry, screen: &UiScreen) {
    let vocabulary = &registry.root.ui.vocabulary;
    runtime.heading(&screen.title);

    if let Some(usage) = &screen.usage {
        println!(
            "\n{}\n  {}",
            vocabulary.usage,
            runtime.console.yellow(usage)
        );
    }
    if !screen.requirements.is_empty() {
        println!("\n{}", vocabulary.requires);
        for requirement in &screen.requirements {
            print!("  {}", requirement.text);
            if let Some(link) = &requirement.link {
                print!(" {}", runtime.console.link(&link.label, &link.url));
            }
            println!();
        }
    }
    if let Some(description) = &screen.description {
        println!("\n{}", description.trim());
    }
    if let Some(section) = &screen.section {
        println!("\n{}", section.title);
        let entries = section
            .entries
            .iter()
            .map(|entry| (entry.label.as_str(), entry.description.as_str()))
            .collect::<Vec<_>>();
        print_entries(runtime, &entries);
    }
}

pub fn root_prompt<'a>(registry: &'a Registry, route: &str) -> &'a UiPrompt {
    registry
        .root
        .ui
        .prompts
        .get(route)
        .expect("validated root UI prompt exists")
}

pub fn component_prompt<'a>(registry: &'a Registry, route: &str) -> &'a UiPrompt {
    registry
        .current_target()
        .expect("component context exists")
        .manifest
        .ui
        .prompts
        .get(route)
        .expect("validated component UI prompt exists")
}

pub fn render_prompt(
    runtime: &Runtime,
    prompt: &UiPrompt,
    replacements: &[(&str, &str)],
) -> std::io::Result<bool> {
    if let Some(title) = &prompt.title {
        runtime.heading(title);
    }
    if let Some(description) = &prompt.description {
        println!("\n{}\n", description.trim());
    }
    let question = interpolate(&prompt.question, replacements);
    runtime.confirm(&question)
}

pub fn declined(runtime: &Runtime, prompt: &UiPrompt) {
    if let Some(message) = &prompt.declined {
        runtime.note(message);
    }
}

fn menu(registry: &Registry) -> &UiMenu {
    registry
        .current_target()
        .map_or(&registry.root.ui.menu, |component| {
            &component.manifest.ui.menu
        })
}

fn print_entries(runtime: &Runtime, entries: &[(&str, &str)]) {
    let width = entries
        .iter()
        .map(|(label, _)| label.chars().count())
        .max()
        .unwrap_or(0)
        + 3;
    for (label, description) in entries {
        let padded = format!("{label:<width$}");
        println!("  {}{}", runtime.console.cyan(&padded), description);
    }
}

fn interpolate(template: &str, replacements: &[(&str, &str)]) -> String {
    replacements
        .iter()
        .fold(template.to_string(), |rendered, (name, value)| {
            rendered.replace(&format!("{{{name}}}"), value)
        })
}
