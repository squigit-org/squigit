pub mod commands;
pub mod components;
pub mod console;
pub mod error;
pub mod registry;
pub mod workspace;

use chrono::Local;
pub use console::Console;
use registry::Registry;
use std::env;
use std::path::{Path, PathBuf};

pub type XtaskResult<T = ()> = Result<T, String>;

pub struct Runtime {
    pub console: Console,
    pub repo_root: PathBuf,
    pub temp_root: PathBuf,
}

impl Runtime {
    pub fn from_registry(registry: &Registry) -> Self {
        Self {
            console: Console::auto(),
            repo_root: registry.repo_root.clone(),
            temp_root: env::temp_dir().join(&registry.root.context.temp_namespace),
        }
    }

    pub fn today_calver(&self) -> String {
        Local::now().format("%y.%m.%d").to_string()
    }

    pub fn today_date(&self) -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    pub fn model_root(&self) -> PathBuf {
        self.temp_root.join("paddle-ocr/models")
    }

    pub fn relative_path(&self, path: &Path) -> String {
        path.strip_prefix(&self.repo_root)
            .unwrap_or(path)
            .display()
            .to_string()
    }
}

pub fn run(args: &[String]) -> i32 {
    let mut registry = match Registry::load_from_current_dir() {
        Ok(registry) => registry,
        Err(error) => {
            eprintln!("{}", Console::auto().red(&error));
            return 1;
        }
    };
    let mut forwarded_args = args.to_vec();
    if registry.is_repository() {
        let selected_component = forwarded_args
            .first()
            .and_then(|value| {
                registry
                    .target_by_relative_path(value)
                    .map(|component| (0, component.directory.clone()))
            })
            .or_else(|| {
                if forwarded_args.len() < 2 || !commands::accepts_component_path(&forwarded_args[0])
                {
                    return None;
                }
                registry
                    .target_for_command(&forwarded_args[0], &forwarded_args[1])
                    .map(|component| (1, component.directory.clone()))
            })
            .or_else(|| {
                if forwarded_args.len() < 2 || !commands::accepts_component_path(&forwarded_args[1])
                {
                    return None;
                }
                registry
                    .target_for_command(&forwarded_args[1], &forwarded_args[0])
                    .map(|component| (0, component.directory.clone()))
            });
        if let Some((component_index, component_directory)) = selected_component {
            if let Err(error) = env::set_current_dir(&component_directory) {
                eprintln!(
                    "{}",
                    Console::auto().red(&error::could_not_enter_context(
                        &component_directory,
                        &error
                    ))
                );
                return 1;
            }
            forwarded_args.remove(component_index);
            registry = match Registry::load_from_current_dir() {
                Ok(registry) => registry,
                Err(error) => {
                    eprintln!("{}", Console::auto().red(&error));
                    return 1;
                }
            };
        }
    }
    let mut runtime = Runtime::from_registry(&registry);
    commands::dispatch(&mut runtime, &registry, &forwarded_args)
}
