use crate::registry::Registry;
use crate::{console, workspace, Runtime};
use std::path::Path;
use zeroize::Zeroizing;

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if let Err(code) = super::root_only(runtime, registry, "crypto") {
        return code;
    }
    if args.is_empty() {
        console::render_root_screen(runtime, registry, "crypto");
        return 0;
    }
    let result = match args {
        [action, rest @ ..] if action == "keygen" => {
            let yes = match super::parse_optional_yes(
                rest,
                "crypto keygen accepts only the optional --yes flag.",
            ) {
                Ok(yes) => yes,
                Err(error) => return super::fail(runtime, &error),
            };
            if !yes {
                let prompt = console::root_prompt(registry, "crypto.keygen");
                match console::render_prompt(runtime, prompt, &[]) {
                    Ok(true) => {}
                    Ok(false) => {
                        console::declined(runtime, prompt);
                        return 0;
                    }
                    Err(error) => {
                        return super::fail(
                            runtime,
                            &format!("Could not read confirmation: {error}"),
                        )
                    }
                }
            }
            workspace::crypto::keygen(runtime)
        }
        [action] if action == "sign" => {
            console::render_root_screen(runtime, registry, "crypto.sign");
            return 0;
        }
        [action, artifact] if action == "sign" => {
            let private_key = match std::env::var("YOUR_PRIV_KEY") {
                Ok(value) if !value.trim().is_empty() => Zeroizing::new(value),
                _ => {
                    return super::fail(
                        runtime,
                        "crypto sign requires non-empty PEM contents in YOUR_PRIV_KEY.",
                    )
                }
            };
            workspace::crypto::sign(runtime, Path::new(artifact), private_key.as_str())
        }
        [action, ..] => {
            if !matches!(action.as_str(), "keygen" | "sign") {
                return super::fail(runtime, &format!("Unknown crypto action '{action}'."));
            }
            return super::fail(runtime, "Invalid crypto arguments.");
        }
        _ => return super::fail(runtime, "Invalid crypto arguments."),
    };
    match result {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}
