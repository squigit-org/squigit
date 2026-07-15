use crate::{Runtime, XtaskResult};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";

pub fn run(runtime: &Runtime, action: &str, profile_id: Option<&str>) -> XtaskResult {
    let arguments = cargo_arguments(action, profile_id);
    let config_dir = auth_config_dir(&runtime.temp_root);
    println!("  $ cargo run -p squigit-auth --example live_auth_harness -- {action} ...");
    let status = Command::new("cargo")
        .args(&arguments)
        .current_dir(&runtime.repo_root)
        .env(CONFIG_DIR_ENV, &config_dir)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start the live auth harness: {error}"))?;

    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("Live auth harness exited with status {code}."))
    } else {
        Err("Live auth harness was terminated by a signal.".to_string())
    }
}

fn auth_config_dir(temp_root: &Path) -> PathBuf {
    temp_root.join("live/auth/userData")
}

fn cargo_arguments(action: &str, profile_id: Option<&str>) -> Vec<String> {
    let mut arguments = vec![
        "run".to_string(),
        "-p".to_string(),
        "squigit-auth".to_string(),
        "--example".to_string(),
        "live_auth_harness".to_string(),
        "--".to_string(),
        action.to_string(),
    ];
    if let Some(profile_id) = profile_id {
        arguments.push(profile_id.to_string());
    }
    arguments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forwards_auth_actions_and_optional_remove_profile_id() {
        let login = cargo_arguments("login", None);
        assert_eq!(login.last().map(String::as_str), Some("login"));

        let remove = cargo_arguments("remove", Some("google_abc123"));
        assert_eq!(
            &remove[remove.len() - 2..],
            &["remove".to_string(), "google_abc123".to_string()]
        );
    }

    #[test]
    fn auth_uses_a_persistent_store_separate_from_live_brain() {
        let temp_root = Path::new("/tmp/squigit-xtask");
        let auth = auth_config_dir(temp_root);
        let brain = temp_root.join("live/userData");

        assert_eq!(auth, temp_root.join("live/auth/userData"));
        assert_ne!(auth, brain);
    }
}
