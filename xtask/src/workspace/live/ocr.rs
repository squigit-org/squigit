use crate::{Runtime, XtaskResult};
use std::process::{Command, Stdio};

const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";
const REPO_ROOT_ENV: &str = "SQUIGIT_REPO_ROOT";

pub const MODELS: [&str; 6] = [
    "pp-ocr-v5-en",
    "pp-ocr-v5-latin",
    "pp-ocr-v5-cyrillic",
    "pp-ocr-v5-korean",
    "pp-ocr-v5-cjk",
    "pp-ocr-v5-devanagari",
];

/// Short language aliases accepted alongside full model IDs.
const LANG_ALIASES: [&str; 6] = ["en", "la", "ru", "ko", "ch", "hi"];

pub fn is_known_model(specifier: &str) -> bool {
    MODELS.contains(&specifier) || LANG_ALIASES.contains(&specifier)
}

pub fn analyze(runtime: &Runtime, image: Option<&str>, model: Option<&str>) -> XtaskResult {
    let mut arguments = Vec::new();
    if let Some(image) = image {
        arguments.push(image.to_string());
    }
    if let Some(model) = model {
        arguments.push(model.to_string());
    }
    run_harness(runtime, "analyze", &arguments)?;
    runtime.success("Live OCR analyze passed.");
    Ok(())
}

pub fn download(runtime: &Runtime, model: &str) -> XtaskResult {
    run_harness(runtime, "download", &[model.to_string()])?;
    runtime.success(&format!("Live OCR download of '{model}' passed."));
    Ok(())
}

pub fn models(runtime: &Runtime) -> XtaskResult {
    run_harness(runtime, "models", &[])?;
    Ok(())
}

fn run_harness(runtime: &Runtime, operation: &str, arguments: &[String]) -> XtaskResult {
    let cargo_arguments = cargo_arguments(operation, arguments);
    let config_dir = runtime.temp_root.join("live/ocr/userData");
    println!("  $ cargo run -p ocr-runtime --example live_ocr_harness -- {operation} ...");
    let status = Command::new("cargo")
        .args(&cargo_arguments)
        .current_dir(&runtime.repo_root)
        .env(CONFIG_DIR_ENV, &config_dir)
        .env(REPO_ROOT_ENV, &runtime.repo_root)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start the live OCR harness: {error}"))?;

    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("Live OCR harness exited with status {code}."))
    } else {
        Err("Live OCR harness was terminated by a signal.".to_string())
    }
}

fn cargo_arguments(operation: &str, arguments: &[String]) -> Vec<String> {
    let mut command = vec![
        "run".to_string(),
        "-p".to_string(),
        "ocr-runtime".to_string(),
        "--example".to_string(),
        "live_ocr_harness".to_string(),
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
    fn model_registry_contains_all_six_models() {
        assert_eq!(MODELS.len(), 6);
        assert!(MODELS.contains(&"pp-ocr-v5-en"));
        assert!(MODELS.contains(&"pp-ocr-v5-korean"));
        assert!(MODELS.contains(&"pp-ocr-v5-cjk"));
    }

    #[test]
    fn is_known_model_accepts_full_ids_and_short_aliases() {
        assert!(is_known_model("pp-ocr-v5-en"));
        assert!(is_known_model("en"));
        assert!(is_known_model("ko"));
        assert!(!is_known_model("pp-ocr-v5-arabic"));
        assert!(!is_known_model("zz"));
    }

    #[test]
    fn cargo_arguments_include_the_operation_and_forwarded_args() {
        let args = cargo_arguments("analyze", &["image.png".to_string(), "ko".to_string()]);
        assert_eq!(
            &args[args.len() - 3..],
            &["analyze".to_string(), "image.png".to_string(), "ko".to_string()]
        );
    }

    #[test]
    fn models_command_passes_no_arguments() {
        let args = cargo_arguments("models", &[]);
        assert_eq!(args.last().map(String::as_str), Some("models"));
    }
}
