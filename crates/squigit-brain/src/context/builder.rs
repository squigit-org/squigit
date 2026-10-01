// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Title prompt access.

use crate::context::loader::load_title_prompt;

pub fn get_title_prompt() -> Result<String, String> {
    load_title_prompt()
}

pub(crate) fn conversation_prompt(
    image_thread: bool,
    initial: bool,
    effort: &str,
    identity: &serde_json::Value,
) -> Result<String, String> {
    fn yaml_text(source: &str) -> Result<String, String> {
        let value: serde_yaml::Value =
            serde_yaml::from_str(source).map_err(|error| error.to_string())?;
        Ok(value
            .as_mapping()
            .into_iter()
            .flat_map(|map| map.values())
            .filter_map(serde_yaml::Value::as_str)
            .collect::<Vec<_>>()
            .join("\n"))
    }
    let primary = match (image_thread, initial) {
        (true, true) => yaml_text(include_str!("../assets/core/squigit/system_prompt.yml"))?,
        (false, true) => yaml_text(include_str!("../assets/core/sidechat/system_prompt.yml"))?,
        (true, false) => include_str!("../assets/core/squigit/context_window.md").to_string(),
        (false, false) => include_str!("../assets/core/sidechat/context_window.md").to_string(),
    };
    let shared = yaml_text(include_str!("../assets/core/shared_instructions.yml"))?;
    let user = yaml_text(include_str!("../assets/core/user_identity.yml"))?;
    let effort_rules = match effort {
        "instant" => "Solve the whole request directly with minimal unnecessary reasoning. Complete the requested output even if it is long. Avoid unsolicited additions and exploration.",
        "medium" => "Answer naturally with the detail the task needs.",
        "high" | "xhigh" => "Reason carefully and add useful explanation, context, and suggestions for substantive tasks. Greetings, thanks, and simple exchanges still need a natural short answer. Do not pad replies.",
        _ => return Err("Invalid effort selection".to_string()),
    };
    let knowledge = if image_thread && initial {
        if effort == "instant" {
            ""
        } else {
            include_str!("../assets/knowledge/known_scenes.json")
        }
    } else {
        include_str!("../assets/knowledge/squigit_guide.md")
    };
    Ok(format!("{primary}\n{shared}\n{user}\n{effort_rules}\nUser identity and environment:\n{identity}\nReference knowledge:\n{knowledge}\nWeb search and PDF/Office tools are temporarily unavailable. Do not claim to search the web. Use list_directory to discover requested paths, grep_search to locate relevant text, and read_file to inspect text or actual image pixels. The user can request a local folder or file in ordinary text without attaching or mentioning it. The Local file access section names the authorized paths, including requested standard folders such as Downloads or Screenshots. Use those exact paths. For the last or newest image in a folder, list_directory with sort_by=modified and include_pattern for images, then read_file on the newest image. Absolute paths remain scoped to the user's requests. Attachment briefs can answer broad questions about their subject when they contain enough information. Read original attachments via recall_attachment for exact image content, quotations, or problems; do not guess those from a brief."))
}
