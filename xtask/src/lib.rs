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
        format!("{}.1", Local::now().format("%y.%m.%d"))
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
        let component_index = forwarded_args
            .first()
            .and_then(|value| registry.target_by_relative_path(value).map(|_| 0))
            .or_else(|| {
                (forwarded_args.len() >= 2
                    && commands::accepts_component_path(&forwarded_args[0])
                    && registry
                        .target_by_relative_path(&forwarded_args[1])
                        .is_some())
                .then_some(1)
            });
        let component_directory = component_index.and_then(|index| {
            registry
                .target_by_relative_path(&forwarded_args[index])
                .map(|component| component.directory.clone())
        });
        if let Some(component_directory) = component_directory {
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
            forwarded_args.remove(component_index.expect("component index exists"));
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
