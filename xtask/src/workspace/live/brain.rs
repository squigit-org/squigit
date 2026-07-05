use crate::{environment, Runtime, XtaskResult};
use std::process::{Command, Stdio};

const API_KEY_ENV: &str = "GEMINI_API_KEY";
const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";

pub fn analyze(runtime: &Runtime, image: &str, message: &[String]) -> XtaskResult {
    let mut arguments = vec![image.to_string()];
    arguments.extend_from_slice(message);
    run_harness(runtime, "analyze", &arguments)?;
    runtime.success("Live brain analyze passed.");
    Ok(())
}

pub fn prompt(runtime: &Runtime, thread: &str, message: &[String]) -> XtaskResult {
    let mut arguments = vec![thread.to_string()];
    arguments.extend_from_slice(message);
    run_harness(runtime, "prompt", &arguments)?;
    runtime.success("Live brain prompt passed.");
    Ok(())
}

pub fn threads(runtime: &Runtime) -> XtaskResult {
    run_harness(runtime, "threads", &[])?;
    runtime.success("Temporary brain threads listed.");
    Ok(())
}

fn run_harness(runtime: &Runtime, operation: &str, arguments: &[String]) -> XtaskResult {
    let api_key = operation_requires_api_key(operation)
        .then(|| {
            environment::required_variable(
                runtime,
                API_KEY_ENV,
                &format!("{API_KEY_ENV} is required for live brain analyze and prompt."),
            )
        })
        .transpose()?;

    let cargo_arguments = cargo_arguments(operation, arguments);
    let config_dir = runtime.temp_root.join("live/userData");
    println!("  $ cargo run -p squigit-brain --example live_brain_harness -- {operation} ...");
    let mut command = Command::new("cargo");
    command
        .args(&cargo_arguments)
        .current_dir(&runtime.repo_root)
        .env(CONFIG_DIR_ENV, &config_dir)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if let Some(api_key) = api_key {
        command.env(API_KEY_ENV, api_key);
    }
    let status = command
        .status()
        .map_err(|error| format!("Could not start the live brain harness: {error}"))?;

    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("Live brain harness exited with status {code}."))
    } else {
        Err("Live brain harness was terminated by a signal.".to_string())
    }
}

fn operation_requires_api_key(operation: &str) -> bool {
    matches!(operation, "analyze" | "prompt")
}

fn cargo_arguments(operation: &str, arguments: &[String]) -> Vec<String> {
    let mut command = vec![
        "run".to_string(),
        "-p".to_string(),
        "squigit-brain".to_string(),
        "--example".to_string(),
        "live_brain_harness".to_string(),
        "--".to_string(),
        operation.to_string(),
    ];
    command.extend_from_slice(arguments);
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyze_arguments_allow_an_image_without_a_message() {
        let arguments = cargo_arguments("analyze", &["fixture.png".to_string()]);

        assert_eq!(
            &arguments[arguments.len() - 2..],
            &["analyze".to_string(), "fixture.png".to_string()]
        );
    }

    #[test]
    fn prompt_arguments_preserve_every_message_word() {
        let arguments = cargo_arguments(
            "prompt",
            &[
                "thread-123".to_string(),
                "hello".to_string(),
                "brain".to_string(),
            ],
        );

        assert_eq!(
            &arguments[arguments.len() - 4..],
            &[
                "prompt".to_string(),
                "thread-123".to_string(),
                "hello".to_string(),
                "brain".to_string(),
            ]
        );
    }

    #[test]
    fn listing_threads_does_not_require_an_api_key() {
        assert!(operation_requires_api_key("analyze"));
        assert!(operation_requires_api_key("prompt"));
        assert!(!operation_requires_api_key("threads"));
    }
}
