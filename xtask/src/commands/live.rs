use crate::registry::Registry;
use crate::{console, workspace, Runtime};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if let Err(code) = super::root_only(runtime, registry, "live") {
        return code;
    }
    if args.is_empty() {
        console::render_root_screen(runtime, registry, "live");
        return 0;
    }
    match args[0].as_str() {
        "auth" => auth(runtime, registry, &args[1..]),
        "brain" => brain(runtime, registry, &args[1..]),
        "ocr" => ocr(runtime, registry, &args[1..]),
        "capture" => capture(runtime, registry, &args[1..]),
        unknown => super::fail(runtime, &format!("Unknown live workflow '{unknown}'.")),
    }
}

fn auth(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if args.is_empty() {
        console::render_root_screen(runtime, registry, "live.auth");
        return 0;
    }
    let (action, subject) = match args {
        [action] if matches!(action.as_str(), "login" | "signup" | "logout" | "profiles") => {
            (action.as_str(), None)
        }
        [action, subject] if action == "remove" => (action.as_str(), Some(subject.as_str())),
        _ => return super::fail(runtime, "Invalid live auth arguments."),
    };
    match workspace::live::auth::run(runtime, action, subject) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

fn brain(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if args.is_empty() {
        console::render_root_screen(runtime, registry, "live.brain");
        return 0;
    }
    let result = match args[0].as_str() {
        "analyze" if args.len() >= 2 => {
            workspace::live::brain::analyze(runtime, &args[1], &args[2..])
        }
        "prompt" if args.len() >= 3 => {
            workspace::live::brain::prompt(runtime, &args[1], &args[2..])
        }
        "threads" if args.len() == 1 => workspace::live::brain::threads(runtime),
        _ => return super::fail(runtime, "Invalid live brain arguments."),
    };
    match result {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

fn ocr(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if args.is_empty() {
        console::render_root_screen(runtime, registry, "live.ocr");
        return 0;
    }
    let result = match args {
        [action] if action == "analyze" => workspace::live::ocr::analyze(runtime, None, None),
        [action, arg] if action == "analyze" => {
            if workspace::live::ocr::is_known_model(arg) {
                workspace::live::ocr::analyze(runtime, None, Some(arg))
            } else {
                workspace::live::ocr::analyze(runtime, Some(arg), None)
            }
        }
        [action, image, model] if action == "analyze" => {
            workspace::live::ocr::analyze(runtime, Some(image), Some(model))
        }
        [action, model] if action == "download" => {
            if !workspace::live::ocr::is_known_model(model) {
                return super::fail(runtime, &format!("Unknown OCR model '{model}'."));
            }
            workspace::live::ocr::download(runtime, model)
        }
        [action] if action == "models" => workspace::live::ocr::models(runtime),
        _ => return super::fail(runtime, "Invalid live OCR arguments."),
    };
    match result {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

fn capture(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if args.is_empty() {
        console::render_root_screen(runtime, registry, "live.capture");
        return 0;
    }
    let [mode] = args else {
        return super::fail(runtime, "live capture requires exactly one mode.");
    };
    if !matches!(mode.as_str(), "traditional" | "squiggle") {
        return super::fail(runtime, "Capture mode must be traditional or squiggle.");
    }
    match workspace::live::capture::run(runtime, mode) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}
