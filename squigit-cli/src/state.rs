// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::commands::{matching_commands, SlashCommand};
use squigit::file_index::{FileIndexEntryKind, FileIndexOptions, FileSearchIndex};
use std::path::{Path, PathBuf};

pub const SPINNER_FRAMES: &[char] = &['|', '/', '-', '\\'];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum View {
    Auth,
    Home,
    Menu,
    Prompt,
    Reveal,
    Ocr,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NoticeKind {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Clone, Debug)]
pub struct Notice {
    pub kind: NoticeKind,
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct CurrentThread {
    pub id: String,
    pub title: String,
    pub ocr_job_id: Option<String>,
}

#[derive(Clone, Debug)]
pub enum Suggestion {
    Command {
        command: SlashCommand,
        name: String,
        description: String,
    },
    File {
        name: String,
        path: PathBuf,
    },
}

#[derive(Clone, Debug)]
pub enum MenuAction {
    ResumeThread { id: String, title: String },
    SwitchProfile { id: String },
    SetModel { id: String },
    SetEffort { effort: String },
    SetOcrModel { id: String },
    DownloadOcrModel { id: String },
    CancelOcrModel { id: String },
    ConfigureKey { provider: String },
    DeleteKey { provider: String },
    RevealKey { provider: String },
    CancelAttachmentJobs,
    CancelOcrJob { id: String },
    Back,
}

#[derive(Clone, Debug)]
pub struct MenuItem {
    pub section: String,
    pub label: String,
    pub detail: String,
    pub action: MenuAction,
}

#[derive(Clone, Debug)]
pub enum PromptAction {
    Analyze,
    Rename,
    Scan,
    ConfigureKey { provider: String },
    ConfirmDelete,
}

#[derive(Clone, Debug)]
pub struct RevealState {
    pub provider: String,
    pub pin: String,
    pub input: String,
}

pub struct AppState {
    pub version: &'static str,
    pub cwd: PathBuf,
    pub profile_id: Option<String>,
    pub profile_label: String,
    pub model: String,
    pub effort: String,
    pub ocr_language: String,
    pub ocr_enabled: bool,
    pub gemini_configured: bool,
    pub imgbb_configured: bool,
    pub view: View,
    pub auth_selection: usize,
    pub input: String,
    pub cursor: usize,
    pub suggestions: Vec<Suggestion>,
    pub selected: usize,
    pub attachments: Vec<PathBuf>,
    pub menu_title: String,
    pub menu_items: Vec<MenuItem>,
    pub prompt_title: String,
    pub prompt_hint: String,
    pub prompt_input: String,
    pub prompt_action: Option<PromptAction>,
    pub prompt_secret: bool,
    pub reveal: Option<RevealState>,
    pub current_thread: Option<CurrentThread>,
    pub notices: Vec<Notice>,
    pub busy: Option<String>,
    pub spinner_index: usize,
    pub update_notice: Option<String>,
    pub ocr_text: String,
    pub color: bool,
    pub quit: bool,
    pub file_index: Option<FileSearchIndex>,
}

impl AppState {
    pub fn load(cwd: PathBuf, color: bool, enter_guest: bool) -> Result<Self, String> {
        let settings = squigit::settings::load_settings()?;
        let profiles = squigit::profile::get_profile_snapshot().map_err(|error| error.to_string())?;
        let profile_label = profiles
            .active_profile
            .as_ref()
            .map(|profile| profile.email.clone())
            .unwrap_or_else(|| "guest".to_string());
        let view = if profiles.active_profile_id.is_none() && !enter_guest {
            View::Auth
        } else {
            View::Home
        };
        let file_index = FileSearchIndex::new(
            &cwd,
            FileIndexOptions {
                extensions: squigit::cli::SUPPORTED_FILE_EXTENSIONS
                    .iter()
                    .map(|extension| (*extension).to_string())
                    .collect(),
                ..FileIndexOptions::default()
            },
        )
        .ok();

        Ok(Self {
            version: env!("CARGO_PKG_VERSION"),
            cwd,
            profile_id: settings.active_profile_id,
            profile_label,
            model: settings.config.model,
            effort: settings.config.effort,
            ocr_language: settings.config.ocr_language,
            ocr_enabled: settings.config.ocr_enabled,
            gemini_configured: settings.google_ai_studio.configured,
            imgbb_configured: settings.imgbb.configured,
            view,
            auth_selection: 0,
            input: String::new(),
            cursor: 0,
            suggestions: Vec::new(),
            selected: 0,
            attachments: Vec::new(),
            menu_title: String::new(),
            menu_items: Vec::new(),
            prompt_title: String::new(),
            prompt_hint: String::new(),
            prompt_input: String::new(),
            prompt_action: None,
            prompt_secret: false,
            reveal: None,
            current_thread: None,
            notices: Vec::new(),
            busy: None,
            spinner_index: 0,
            update_notice: None,
            ocr_text: String::new(),
            color,
            quit: false,
            file_index,
        })
    }

    pub fn spinner(&self) -> char {
        SPINNER_FRAMES[self.spinner_index % SPINNER_FRAMES.len()]
    }

    pub fn tick(&mut self) {
        self.spinner_index = (self.spinner_index + 1) % SPINNER_FRAMES.len();
    }

    pub fn set_notice(&mut self, kind: NoticeKind, text: impl Into<String>) {
        self.notices.push(Notice {
            kind,
            text: text.into(),
        });
        if self.notices.len() > 8 {
            self.notices.remove(0);
        }
    }

    pub fn set_input(&mut self, value: String) {
        self.input = value;
        self.cursor = self.input.len();
        self.refresh_suggestions();
    }

    pub fn insert_input(&mut self, character: char) {
        self.input.insert(self.cursor, character);
        self.cursor += character.len_utf8();
        self.refresh_suggestions();
    }

    pub fn backspace_input(&mut self) {
        if self.cursor == 0 {
            return;
        }
        let previous = self.input[..self.cursor]
            .char_indices()
            .next_back()
            .map(|(index, _)| index)
            .unwrap_or(0);
        self.input.drain(previous..self.cursor);
        self.cursor = previous;
        self.refresh_suggestions();
    }

    pub fn move_cursor_left(&mut self) {
        if self.cursor == 0 {
            return;
        }
        self.cursor = self.input[..self.cursor]
            .char_indices()
            .next_back()
            .map(|(index, _)| index)
            .unwrap_or(0);
        self.refresh_suggestions();
    }

    pub fn move_cursor_right(&mut self) {
        if self.cursor >= self.input.len() {
            return;
        }
        self.cursor += self.input[self.cursor..]
            .chars()
            .next()
            .map(char::len_utf8)
            .unwrap_or(0);
        self.refresh_suggestions();
    }

    pub fn refresh_suggestions(&mut self) {
        self.suggestions = if self.input.starts_with('/') {
            matching_commands(&self.input)
                .into_iter()
                .map(|candidate| Suggestion::Command {
                    command: candidate.command,
                    name: candidate.name.to_string(),
                    description: candidate.description.to_string(),
                })
                .collect()
        } else if let Some(query) = active_mention(&self.input, self.cursor) {
            self.file_index
                .as_ref()
                .map(|index| {
                    index
                        .search(query, 12)
                        .into_iter()
                        .filter(|matched| matched.entry.kind == FileIndexEntryKind::File)
                        .map(|matched| Suggestion::File {
                            name: matched.entry.name,
                            path: matched.entry.path,
                        })
                        .collect()
                })
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        self.selected = self.selected.min(self.suggestions.len().saturating_sub(1));
    }

    pub fn clear_composer(&mut self) {
        self.input.clear();
        self.cursor = 0;
        self.suggestions.clear();
        self.attachments.clear();
        self.selected = 0;
    }

    pub fn open_menu(&mut self, title: impl Into<String>, items: Vec<MenuItem>) {
        self.menu_title = title.into();
        self.menu_items = items;
        self.selected = 0;
        self.view = View::Menu;
    }

    pub fn open_prompt(
        &mut self,
        title: impl Into<String>,
        hint: impl Into<String>,
        action: PromptAction,
        secret: bool,
    ) {
        self.prompt_title = title.into();
        self.prompt_hint = hint.into();
        self.prompt_input.clear();
        self.prompt_action = Some(action);
        self.prompt_secret = secret;
        self.view = View::Prompt;
    }

    pub fn return_home(&mut self) {
        self.view = View::Home;
        self.menu_items.clear();
        self.prompt_action = None;
        self.prompt_input.clear();
        self.prompt_secret = false;
        self.reveal = None;
        self.selected = 0;
    }

    pub fn refresh_account(&mut self) -> Result<(), String> {
        let settings = squigit::settings::load_settings()?;
        let profiles = squigit::profile::get_profile_snapshot().map_err(|error| error.to_string())?;
        self.profile_id = settings.active_profile_id;
        self.profile_label = profiles
            .active_profile
            .map(|profile| profile.email)
            .unwrap_or_else(|| "guest".to_string());
        self.model = settings.config.model;
        self.effort = settings.config.effort;
        self.ocr_enabled = settings.config.ocr_enabled;
        self.ocr_language = settings.config.ocr_language;
        self.gemini_configured = settings.google_ai_studio.configured;
        self.imgbb_configured = settings.imgbb.configured;
        Ok(())
    }
}

pub fn display_directory(path: &Path) -> String {
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        if path == home {
            return "~".to_string();
        }
        if let Ok(suffix) = path.strip_prefix(&home) {
            return format!("~/{}", suffix.display());
        }
    }
    path.display().to_string()
}

pub fn active_mention(input: &str, cursor: usize) -> Option<&str> {
    let before = input.get(..cursor)?;
    let token = before
        .rsplit_once(char::is_whitespace)
        .map_or(before, |(_, token)| token);
    token.strip_prefix('@')
}
