use crate::{Runtime, XtaskResult};
use std::env::VarError;
use std::path::Path;

pub fn required_variable(
    runtime: &Runtime,
    name: &str,
    missing_error: &str,
) -> XtaskResult<String> {
    let environment_value = match std::env::var(name) {
        Ok(value) => Some(value),
        Err(VarError::NotPresent) => None,
        Err(VarError::NotUnicode(_)) => {
            return Err(format!("{name} contains non-Unicode data."));
        }
    };

    resolve_variable(
        &runtime.repo_root.join(".env"),
        name,
        environment_value,
        missing_error,
    )
}

fn resolve_variable(
    dotenv_path: &Path,
    name: &str,
    environment_value: Option<String>,
    missing_error: &str,
) -> XtaskResult<String> {
    if let Some(value) = environment_value.filter(|value| !value.trim().is_empty()) {
        return Ok(value);
    }

    if dotenv_path.exists() {
        let entries = dotenvy::from_path_iter(dotenv_path)
            .map_err(|error| format!("Could not read {}: {error}", dotenv_path.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Could not parse {}: {error}", dotenv_path.display()))?;

        if let Some((_, value)) = entries
            .into_iter()
            .find(|(key, value)| key == name && !value.trim().is_empty())
        {
            return Ok(value);
        }
    }

    Err(missing_error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn process_environment_wins_without_reading_dotenv() {
        let directory = tempfile::tempdir().unwrap();
        let dotenv = directory.path().join(".env");
        fs::write(&dotenv, "this is not valid dotenv syntax\n").unwrap();

        let value = resolve_variable(
            &dotenv,
            "GEMINI_API_KEY",
            Some("from-process".to_string()),
            "missing",
        )
        .unwrap();

        assert_eq!(value, "from-process");
    }

    #[test]
    fn empty_process_environment_falls_back_to_dotenv() {
        let directory = tempfile::tempdir().unwrap();
        let dotenv = directory.path().join(".env");
        fs::write(&dotenv, "GEMINI_API_KEY=from-dotenv\n").unwrap();

        let value =
            resolve_variable(&dotenv, "GEMINI_API_KEY", Some("  ".to_string()), "missing").unwrap();

        assert_eq!(value, "from-dotenv");
    }

    #[test]
    fn dotenv_supports_multiline_private_keys() {
        let directory = tempfile::tempdir().unwrap();
        let dotenv = directory.path().join(".env");
        fs::write(
            &dotenv,
            "SQUIGIT_OTA_PRIVATE_KEY_PEM=\"-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\"\n",
        )
        .unwrap();

        let value =
            resolve_variable(&dotenv, "SQUIGIT_OTA_PRIVATE_KEY_PEM", None, "missing").unwrap();

        assert_eq!(
            value,
            "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----"
        );
    }

    #[test]
    fn missing_variable_keeps_the_command_specific_error() {
        let directory = tempfile::tempdir().unwrap();
        let error = resolve_variable(
            &directory.path().join(".env"),
            "GEMINI_API_KEY",
            None,
            "GEMINI_API_KEY is required.",
        )
        .unwrap_err();

        assert_eq!(error, "GEMINI_API_KEY is required.");
    }
}
