// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::commands::{parse_command, SlashCommand};
use crate::state::{
    active_mention, AppState, CurrentThread, MenuAction, MenuItem, NoticeKind, PromptAction,
    RevealState, Suggestion, View,
};
use crate::tasks::{self, TaskEvent};
use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use squigit::settings::ConfigUpdate;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

pub enum Control {
    EditPersonality(PathBuf),
}

pub struct App {
    pub state: AppState,
    sender: UnboundedSender<TaskEvent>,
    receiver: UnboundedReceiver<TaskEvent>,
}

impl App {
    pub fn load(cwd: PathBuf, color: bool, enter_guest: bool) -> Result<Self, String> {
        let (sender, receiver) = unbounded_channel();
        let state = AppState::load(cwd, color, enter_guest)?;
        let app = Self {
            state,
            sender,
            receiver,
        };
        tasks::refresh_updates(&app.sender);
        Ok(app)
    }

    pub fn start_image(&mut self, path: PathBuf) {
        self.state.view = View::Home;
        self.start_analyze(path);
    }

    pub fn tick(&mut self) {
        self.state.tick();
        while let Ok(event) = self.receiver.try_recv() {
            self.handle_task(event);
        }
        self.poll_ocr_job();
        self.poll_thread_title();
    }

    pub fn handle_key(&mut self, key: KeyEvent) -> Option<Control> {
        if key.kind != KeyEventKind::Press {
            return None;
        }
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            self.state.quit = true;
            return None;
        }
        if key.code == KeyCode::Esc {
            self.escape();
            return None;
        }
        if key.code == KeyCode::F(1) {
            self.show_ocr();
            return None;
        }

        match self.state.view {
            View::Auth => self.handle_auth_key(key),
            View::Home => self.handle_home_key(key),
            View::Menu => self.handle_menu_key(key),
            View::Prompt => self.handle_prompt_key(key),
            View::Reveal => self.handle_reveal_key(key),
            View::Ocr => None,
        }
    }

    fn handle_auth_key(&mut self, key: KeyEvent) -> Option<Control> {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => self.state.auth_selection = 0,
            KeyCode::Down | KeyCode::Char('j') => self.state.auth_selection = 1,
            KeyCode::Enter if self.state.auth_selection == 0 => self.start_login(),
            KeyCode::Enter => {
                self.state.view = View::Home;
                self.state
                    .set_notice(NoticeKind::Info, "Guest mode uses local and OCR features");
            }
            _ => {}
        }
        None
    }

    fn handle_home_key(&mut self, key: KeyEvent) -> Option<Control> {
        match key.code {
            KeyCode::Up => self.select_previous(self.state.suggestions.len()),
            KeyCode::Down => self.select_next(self.state.suggestions.len()),
            KeyCode::Left => self.state.move_cursor_left(),
            KeyCode::Right => self.state.move_cursor_right(),
            KeyCode::Home => {
                self.state.cursor = 0;
                self.state.refresh_suggestions();
            }
            KeyCode::End => {
                self.state.cursor = self.state.input.len();
                self.state.refresh_suggestions();
            }
            KeyCode::Backspace => self.state.backspace_input(),
            KeyCode::Char(character)
                if !key
                    .modifiers
                    .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT) =>
            {
                self.state.insert_input(character)
            }
            KeyCode::Enter => return self.submit_home(),
            _ => {}
        }
        None
    }

    fn submit_home(&mut self) -> Option<Control> {
        if self.state.busy.is_some() {
            self.state
                .set_notice(NoticeKind::Warning, "Wait for the current task or run /stop");
            return None;
        }

        if let Some(suggestion) = self.state.suggestions.get(self.state.selected).cloned() {
            match suggestion {
                Suggestion::File { path, .. } if active_mention(&self.state.input, self.state.cursor).is_some() => {
                    self.insert_file_mention(path);
                    return None;
                }
                Suggestion::Command { command, name, .. }
                    if self.state.input.trim() == name =>
                {
                    self.state.clear_composer();
                    return self.execute_command(command, String::new());
                }
                Suggestion::Command { name, .. } if self.state.input.starts_with('/') => {
                    self.state.set_input(name);
                    return None;
                }
                _ => {}
            }
        }

        let input = self.state.input.trim().to_string();
        if input.starts_with('/') {
            self.state.clear_composer();
            return match parse_command(&input) {
                Some((command, arguments)) => self.execute_command(command, arguments.to_string()),
                None => {
                    self.state.set_notice(
                        NoticeKind::Error,
                        format!("Unknown command: {input}. Type / to list commands."),
                    );
                    None
                }
            };
        }
        if input.is_empty() && self.state.attachments.is_empty() {
            return None;
        }

        let paths = self.state.attachments.clone();
        let thread_id = self
            .state
            .current_thread
            .as_ref()
            .map(|thread| thread.id.clone());
        self.state
            .set_notice(NoticeKind::Info, format!("You: {input}"));
        self.state.busy = Some("thinking".to_string());
        tasks::submit(
            &self.sender,
            input,
            paths,
            thread_id,
            self.state.model.clone(),
            self.state.effort.clone(),
        );
        self.state.clear_composer();
        None
    }

    fn insert_file_mention(&mut self, path: PathBuf) {
        let before = &self.state.input[..self.state.cursor];
        let token_start = before
            .char_indices()
            .rev()
            .find(|(_, character)| character.is_whitespace())
            .map(|(index, character)| index + character.len_utf8())
            .unwrap_or(0);
        match squigit::cli::attachment_mention(&path) {
            Ok(mention) => {
                self.state
                    .input
                    .replace_range(token_start..self.state.cursor, &format!("{mention} "));
                self.state.cursor = token_start + mention.len() + 1;
                if !self.state.attachments.contains(&path) {
                    self.state.attachments.push(path);
                }
                self.state.refresh_suggestions();
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn execute_command(&mut self, command: SlashCommand, arguments: String) -> Option<Control> {
        match command {
            SlashCommand::Model => self.open_model_menu(),
            SlashCommand::Analyze if arguments.is_empty() => self.state.open_prompt(
                "Analyze image",
                "Enter one image path",
                PromptAction::Analyze,
                false,
            ),
            SlashCommand::Analyze => self.start_analyze(PathBuf::from(arguments)),
            SlashCommand::Resume => self.open_resume_menu(),
            SlashCommand::Rename if arguments.is_empty() => self.state.open_prompt(
                "Rename thread",
                "Enter a title, or submit empty to generate one",
                PromptAction::Rename,
                false,
            ),
            SlashCommand::Rename => self.rename_thread(arguments),
            SlashCommand::Delete => self.open_delete_prompt(),
            SlashCommand::Fork => self.fork_thread(),
            SlashCommand::Scan if arguments.is_empty() => self.open_scan_menu(),
            SlashCommand::Scan => self.start_scan(arguments),
            SlashCommand::Lens => self.start_lens(),
            SlashCommand::Translate => self.translate(),
            SlashCommand::Logout => self.logout(),
            SlashCommand::Login => self.start_login(),
            SlashCommand::Switch => self.open_profile_menu(),
            SlashCommand::Configure => self.open_configure_menu(),
            SlashCommand::Reveal => self.open_reveal_menu(),
            SlashCommand::Stop => self.open_stop_menu(),
            SlashCommand::Clear => {
                self.state.notices.clear();
                self.state.current_thread = None;
                self.state.clear_composer();
                self.state.return_home();
            }
            SlashCommand::Personality => match squigit::cli::persona_path() {
                Ok(path) => return Some(Control::EditPersonality(path)),
                Err(error) => self.state.set_notice(NoticeKind::Error, error),
            },
            SlashCommand::InstallOcr => {
                self.state.busy = Some("installing Squigit OCR".to_string());
                tasks::install_ocr(&self.sender);
            }
        }
        None
    }

    fn handle_menu_key(&mut self, key: KeyEvent) -> Option<Control> {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => self.select_previous(self.state.menu_items.len()),
            KeyCode::Down | KeyCode::Char('j') => self.select_next(self.state.menu_items.len()),
            KeyCode::Enter => {
                if let Some(item) = self.state.menu_items.get(self.state.selected).cloned() {
                    self.activate_menu(item.action);
                }
            }
            _ => {}
        }
        None
    }

    fn activate_menu(&mut self, action: MenuAction) {
        match action {
            MenuAction::ResumeThread { id, title } => {
                self.state.current_thread = Some(CurrentThread {
                    id,
                    title: title.clone(),
                    ocr_job_id: None,
                });
                self.state.return_home();
                self.state
                    .set_notice(NoticeKind::Success, format!("Resumed {title}"));
            }
            MenuAction::SwitchProfile { id } => {
                match squigit::profile::switch_profile(&id).map_err(|error| error.to_string()) {
                    Ok(_) => {
                        let _ = self.state.refresh_account();
                        self.state.return_home();
                        self.state
                            .set_notice(NoticeKind::Success, "Active profile changed");
                    }
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            MenuAction::SetModel { id } => {
                self.update_config(ConfigUpdate {
                    model: Some(id),
                    ..Default::default()
                });
                self.open_model_menu();
            }
            MenuAction::SetEffort { effort } => {
                self.update_config(ConfigUpdate {
                    effort: Some(effort),
                    ..Default::default()
                });
                self.open_model_menu();
            }
            MenuAction::SetOcrModel { id } => {
                self.update_config(ConfigUpdate {
                    ocr_language: Some(id),
                    ..Default::default()
                });
                self.open_model_menu();
            }
            MenuAction::StartScan { id } => self.start_scan(id),
            MenuAction::DownloadOcrModel { id } => {
                match squigit::settings::download_ocr_model(&id) {
                    Ok(_) => self.state.set_notice(
                        NoticeKind::Info,
                        format!("Downloading OCR model {id} in the background"),
                    ),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
                self.open_model_menu();
            }
            MenuAction::CancelOcrModel { id } => {
                match squigit::settings::cancel_ocr_model_download(&id) {
                    Ok(_) => self.state.set_notice(
                        NoticeKind::Success,
                        format!("OCR model download {id} cancelled"),
                    ),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
                self.open_stop_menu();
            }
            MenuAction::ConfigureKey { provider } => self.state.open_prompt(
                format!("Configure {}", provider_label(&provider)),
                "Enter the API key; input is hidden",
                PromptAction::ConfigureKey { provider },
                true,
            ),
            MenuAction::DeleteKey { provider } => {
                let Some(profile_id) = self.state.profile_id.clone() else {
                    self.guest_key_error();
                    return;
                };
                match squigit::settings::delete_api_key(&profile_id, &provider) {
                    Ok(true) => self
                        .state
                        .set_notice(NoticeKind::Success, "API key deleted"),
                    Ok(false) => self
                        .state
                        .set_notice(NoticeKind::Info, "No API key was stored"),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
                let _ = self.state.refresh_account();
                self.open_configure_menu();
            }
            MenuAction::RevealKey { provider } => {
                let pin = generate_pin();
                self.state.reveal = Some(RevealState {
                    provider,
                    pin,
                    input: String::new(),
                });
                self.state.view = View::Reveal;
            }
            MenuAction::CancelAttachmentJobs => {
                self.state.busy = Some("stopping attachment jobs".to_string());
                self.state.return_home();
                tasks::cancel_attachment_jobs(&self.sender);
            }
            MenuAction::CancelOcrJob { id } => {
                self.state.busy = Some("stopping OCR".to_string());
                self.state.return_home();
                tasks::cancel_ocr_job(&self.sender, id);
            }
            MenuAction::Back => self.state.return_home(),
        }
    }

    fn handle_prompt_key(&mut self, key: KeyEvent) -> Option<Control> {
        match key.code {
            KeyCode::Backspace => {
                self.state.prompt_input.pop();
            }
            KeyCode::Char(character)
                if !key
                    .modifiers
                    .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT) =>
            {
                self.state.prompt_input.push(character);
            }
            KeyCode::Enter => self.submit_prompt(),
            _ => {}
        }
        None
    }

    fn submit_prompt(&mut self) {
        let Some(action) = self.state.prompt_action.clone() else {
            self.state.return_home();
            return;
        };
        let value = self.state.prompt_input.trim().to_string();
        match action {
            PromptAction::Analyze if value.is_empty() => self
                .state
                .set_notice(NoticeKind::Error, "An image path is required"),
            PromptAction::Analyze => self.start_analyze(PathBuf::from(value)),
            PromptAction::Rename if value.is_empty() => {
                let Some(thread_id) = self.current_thread_id() else {
                    return;
                };
                self.state.return_home();
                self.state.busy = Some("generating a title".to_string());
                tasks::generate_title(&self.sender, thread_id);
            }
            PromptAction::Rename => self.rename_thread(value),
            PromptAction::Scan if value.is_empty() => self
                .state
                .set_notice(NoticeKind::Error, "An OCR model ID is required"),
            PromptAction::Scan => self.start_scan(value),
            PromptAction::ConfigureKey { provider } => {
                let Some(profile_id) = self.state.profile_id.clone() else {
                    self.guest_key_error();
                    return;
                };
                match squigit::settings::validate_api_key_format(&provider, &value)
                    .and_then(|valid| {
                        valid
                            .then_some(())
                            .ok_or_else(|| "The API key format is invalid".to_string())
                    })
                    .and_then(|()| squigit::settings::set_api_key(&profile_id, &provider, &value))
                {
                    Ok(()) => {
                        let _ = self.state.refresh_account();
                        self.state.return_home();
                        self.state
                            .set_notice(NoticeKind::Success, "API key saved securely");
                    }
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
                self.state.prompt_input.clear();
            }
            PromptAction::ConfirmDelete if value == "DELETE" => {
                if let Some(thread_id) = self.current_thread_id() {
                    match squigit::explorer::delete_thread(thread_id) {
                        Ok(()) => {
                            self.state.current_thread = None;
                            self.state.return_home();
                            self.state
                                .set_notice(NoticeKind::Success, "Thread deleted");
                        }
                        Err(error) => self.state.set_notice(NoticeKind::Error, error),
                    }
                }
            }
            PromptAction::ConfirmDelete => self
                .state
                .set_notice(NoticeKind::Warning, "Type DELETE exactly to confirm"),
        }
    }

    fn handle_reveal_key(&mut self, key: KeyEvent) -> Option<Control> {
        let Some(reveal) = self.state.reveal.as_mut() else {
            self.state.return_home();
            return None;
        };
        match key.code {
            KeyCode::Backspace => {
                reveal.input.pop();
            }
            KeyCode::Char(character) if character.is_ascii_digit() => {
                reveal.input.push(character);
            }
            KeyCode::Enter => {
                let reveal = reveal.clone();
                if reveal.input != reveal.pin {
                    self.state
                        .set_notice(NoticeKind::Error, "PIN did not match");
                    return None;
                }
                let Some(profile_id) = self.state.profile_id.clone() else {
                    self.guest_key_error();
                    return None;
                };
                match squigit::settings::reveal_api_key(&profile_id, &reveal.provider, true) {
                    Ok(Some(secret)) => self.state.set_notice(
                        NoticeKind::Warning,
                        format!("{}: {secret}", provider_label(&reveal.provider)),
                    ),
                    Ok(None) => self
                        .state
                        .set_notice(NoticeKind::Info, "No API key is stored"),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
                self.state.return_home();
            }
            _ => {}
        }
        None
    }

    fn open_model_menu(&mut self) {
        let mut items = squigit::brain::provider::gemini::models::SELECTABLE_MODELS
            .iter()
            .map(|model| MenuItem {
                section: "AI model".to_string(),
                label: model.name.to_string(),
                detail: if self.state.model == model.id {
                    "active".to_string()
                } else {
                    model.id.to_string()
                },
                action: MenuAction::SetModel {
                    id: model.id.to_string(),
                },
            })
            .collect::<Vec<_>>();
        items.extend(
            squigit::brain::provider::gemini::models::MODEL_EFFORTS
                .iter()
                .map(|effort| MenuItem {
                    section: "Reasoning effort".to_string(),
                    label: (*effort).to_string(),
                    detail: if self.state.effort == *effort {
                        "active".to_string()
                    } else {
                        String::new()
                    },
                    action: MenuAction::SetEffort {
                        effort: (*effort).to_string(),
                    },
                }),
        );
        if let Ok(snapshot) = squigit::settings::load_ocr_models() {
            items.extend(snapshot.models.into_iter().map(|model| {
                let action = if model.state == "downloaded" {
                    MenuAction::SetOcrModel {
                        id: model.id.clone(),
                    }
                } else if matches!(model.state.as_str(), "queued" | "downloading" | "retrying") {
                    MenuAction::CancelOcrModel {
                        id: model.id.clone(),
                    }
                } else {
                    MenuAction::DownloadOcrModel {
                        id: model.id.clone(),
                    }
                };
                let active = (self.state.ocr_language == model.id).then_some("active");
                MenuItem {
                    section: "OCR language and downloads".to_string(),
                    label: model.name,
                    detail: active.unwrap_or(&model.state).to_string(),
                    action,
                }
            }));
        }
        self.state.open_menu("Models", items);
    }

    fn open_resume_menu(&mut self) {
        match squigit::cli::resume_sections_for_directory(&self.state.cwd) {
            Ok(sections) => {
                let items = sections
                    .into_iter()
                    .flat_map(|section| {
                        section.threads.into_iter().map(move |thread| MenuItem {
                            section: section.title.clone(),
                            label: thread.title.clone(),
                            detail: thread.updated_at,
                            action: MenuAction::ResumeThread {
                                id: thread.id,
                                title: thread.title,
                            },
                        })
                    })
                    .collect();
                self.state.open_menu("Resume thread", items);
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn open_profile_menu(&mut self) {
        match squigit::profile::get_profile_snapshot() {
            Ok(snapshot) => {
                let active = snapshot.active_profile_id;
                let mut items = snapshot
                    .profiles
                    .into_iter()
                    .map(|profile| MenuItem {
                        section: "Profiles".to_string(),
                        label: profile.email,
                        detail: if active.as_deref() == Some(&profile.id) {
                            "active".to_string()
                        } else {
                            profile.name
                        },
                        action: MenuAction::SwitchProfile { id: profile.id },
                    })
                    .collect::<Vec<_>>();
                items.push(back_item());
                self.state.open_menu("Switch profile", items);
            }
            Err(error) => self
                .state
                .set_notice(NoticeKind::Error, error.to_string()),
        }
    }

    fn open_scan_menu(&mut self) {
        if self.state.current_thread.is_none() {
            self.no_thread_error();
            return;
        }
        match squigit::settings::load_ocr_models() {
            Ok(snapshot) => {
                let items = snapshot
                    .models
                    .into_iter()
                    .filter(|model| model.state == "downloaded")
                    .map(|model| MenuItem {
                        section: "Installed OCR models".to_string(),
                        label: model.name,
                        detail: model.id.clone(),
                        action: MenuAction::StartScan { id: model.id },
                    })
                    .collect();
                self.state.open_menu("Scan image", items);
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn open_configure_menu(&mut self) {
        if self.state.profile_id.is_none() {
            self.guest_key_error();
            return;
        }
        let mut items = vec![
            MenuItem {
                section: "API keys".to_string(),
                label: "Set Gemini API key".to_string(),
                detail: configured_label(self.state.gemini_configured),
                action: MenuAction::ConfigureKey {
                    provider: "google-ai-studio".to_string(),
                },
            },
            MenuItem {
                section: "API keys".to_string(),
                label: "Set ImgBB API key".to_string(),
                detail: configured_label(self.state.imgbb_configured),
                action: MenuAction::ConfigureKey {
                    provider: "imgbb".to_string(),
                },
            },
        ];
        if self.state.gemini_configured {
            items.push(MenuItem {
                section: "Delete".to_string(),
                label: "Delete Gemini API key".to_string(),
                detail: String::new(),
                action: MenuAction::DeleteKey {
                    provider: "google-ai-studio".to_string(),
                },
            });
        }
        if self.state.imgbb_configured {
            items.push(MenuItem {
                section: "Delete".to_string(),
                label: "Delete ImgBB API key".to_string(),
                detail: String::new(),
                action: MenuAction::DeleteKey {
                    provider: "imgbb".to_string(),
                },
            });
        }
        items.push(back_item());
        self.state.open_menu("Configure", items);
    }

    fn open_reveal_menu(&mut self) {
        if self.state.profile_id.is_none() {
            self.guest_key_error();
            return;
        }
        let mut items = Vec::new();
        if self.state.gemini_configured {
            items.push(MenuItem {
                section: "Reveal".to_string(),
                label: "Gemini API key".to_string(),
                detail: "requires PIN".to_string(),
                action: MenuAction::RevealKey {
                    provider: "google-ai-studio".to_string(),
                },
            });
        }
        if self.state.imgbb_configured {
            items.push(MenuItem {
                section: "Reveal".to_string(),
                label: "ImgBB API key".to_string(),
                detail: "requires PIN".to_string(),
                action: MenuAction::RevealKey {
                    provider: "imgbb".to_string(),
                },
            });
        }
        items.push(back_item());
        self.state.open_menu("Reveal API key", items);
    }

    fn open_stop_menu(&mut self) {
        let mut items = vec![MenuItem {
            section: "Attachments".to_string(),
            label: "Cancel all preparation and upload jobs".to_string(),
            detail: String::new(),
            action: MenuAction::CancelAttachmentJobs,
        }];
        if let Ok(snapshot) = squigit::settings::load_ocr_models() {
            items.extend(
                snapshot
                    .models
                    .into_iter()
                    .filter(|model| {
                        matches!(model.state.as_str(), "queued" | "downloading" | "retrying")
                    })
                    .map(|model| MenuItem {
                        section: "OCR model downloads".to_string(),
                        label: model.name,
                        detail: format!("{}%", model.progress),
                        action: MenuAction::CancelOcrModel { id: model.id },
                    }),
            );
        }
        if let Ok(jobs) = squigit::thread::ocr::get_ocr_jobs_snapshot() {
            items.extend(
                jobs.into_iter()
                    .filter(|job| matches!(job.status.as_str(), "queued" | "running"))
                    .map(|job| MenuItem {
                        section: "OCR scans".to_string(),
                        label: job.job_id.clone(),
                        detail: format!("{} - {}", job.thread_id, job.status),
                        action: MenuAction::CancelOcrJob { id: job.job_id },
                    }),
            );
        }
        items.push(back_item());
        self.state.open_menu("Stop background work", items);
    }

    fn open_delete_prompt(&mut self) {
        if self.state.current_thread.is_none() {
            self.no_thread_error();
            return;
        }
        self.state.open_prompt(
            "Delete thread",
            "Type DELETE to permanently remove this thread",
            PromptAction::ConfirmDelete,
            false,
        );
    }

    fn start_login(&mut self) {
        self.state.view = View::Home;
        self.state.busy = Some("waiting for browser login".to_string());
        tasks::login(&self.sender);
    }

    fn start_analyze(&mut self, path: PathBuf) {
        self.state.return_home();
        self.state.busy = Some(format!("creating image thread from {}", path.display()));
        tasks::analyze(&self.sender, path);
    }

    fn rename_thread(&mut self, title: String) {
        let Some(thread_id) = self.current_thread_id() else {
            return;
        };
        match squigit::explorer::rename_thread(thread_id, title) {
            Ok(thread) => {
                if let Some(current) = self.state.current_thread.as_mut() {
                    current.title = thread.title.clone();
                }
                self.state.return_home();
                self.state
                    .set_notice(NoticeKind::Success, format!("Renamed to {}", thread.title));
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn fork_thread(&mut self) {
        let Some(thread_id) = self.current_thread_id() else {
            return;
        };
        match squigit::explorer::fork_thread(thread_id) {
            Ok(Some(thread)) => {
                self.state.current_thread = Some(CurrentThread {
                    id: thread.id,
                    title: thread.title.clone(),
                    ocr_job_id: None,
                });
                self.state
                    .set_notice(NoticeKind::Success, format!("Forked {}", thread.title));
            }
            Ok(None) => self
                .state
                .set_notice(NoticeKind::Error, "Thread fork returned no thread"),
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn start_scan(&mut self, model_id: String) {
        let Some(thread_id) = self.current_thread_id() else {
            return;
        };
        match squigit::settings::ocr_available() {
            Ok(false) => {
                self.state.return_home();
                self.state.set_notice(
                    NoticeKind::Error,
                    "OCR engine is not installed. Run /install_ocr.",
                );
                return;
            }
            Err(error) => {
                self.state.set_notice(NoticeKind::Error, error);
                return;
            }
            Ok(true) => {}
        }
        match squigit::thread::ocr::start_ocr_thread_job(&thread_id, &model_id) {
            Ok(job_id) => {
                if let Some(thread) = self.state.current_thread.as_mut() {
                    thread.ocr_job_id = Some(job_id);
                }
                self.state.return_home();
                self.state.busy = Some(format!("scanning image with {model_id}"));
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn start_lens(&mut self) {
        let Some(thread_id) = self.current_thread_id() else {
            return;
        };
        self.state.busy = Some("searching Google Lens".to_string());
        tasks::lens(&self.sender, thread_id);
    }

    fn translate(&mut self) {
        let Some(thread_id) = self.current_thread_id() else {
            return;
        };
        let result = squigit::thread::lens::translate_thread_image_url(&thread_id)
            .and_then(|url| squigit::cli::open_external(&url).map(|()| url));
        match result {
            Ok(url) => self
                .state
                .set_notice(NoticeKind::Success, format!("Opened translation: {url}")),
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn logout(&mut self) {
        match squigit::profile::logout().map_err(|error| error.to_string()) {
            Ok(_) => {
                let _ = self.state.refresh_account();
                self.state.set_notice(
                    NoticeKind::Success,
                    "Logged out. Local and OCR features remain available.",
                );
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn update_config(&mut self, update: ConfigUpdate) {
        match squigit::settings::update_config(update) {
            Ok(config) => {
                self.state.model = config.model;
                self.state.effort = config.effort;
                self.state.ocr_enabled = config.ocr_enabled;
                self.state.ocr_language = config.ocr_language;
                self.state
                    .set_notice(NoticeKind::Success, "Default model settings updated");
            }
            Err(error) => self.state.set_notice(NoticeKind::Error, error),
        }
    }

    fn handle_task(&mut self, event: TaskEvent) {
        match event {
            TaskEvent::Update(Ok(Some(update))) => {
                let install = match update.product {
                    squigit::update::UpdateProduct::Cli => {
                        "Run npm install -g @a7mddra/squigit to update."
                    }
                    squigit::update::UpdateProduct::Ocr => {
                        "Run /install_ocr to update the OCR engine."
                    }
                    squigit::update::UpdateProduct::App => "Update from the Squigit desktop app.",
                };
                self.state.update_notice = Some(format!(
                    "{} update available: {} -> {}\n{}\n{}",
                    update.product_name,
                    update.current_version,
                    update.latest_version,
                    install,
                    update.content
                ));
            }
            TaskEvent::Update(Ok(None)) => {}
            TaskEvent::Update(Err(error)) => self
                .state
                .set_notice(NoticeKind::Warning, format!("Update check: {error}")),
            TaskEvent::Login(result) => {
                self.state.busy = None;
                match result {
                    Ok(()) => {
                        let _ = self.state.refresh_account();
                        self.state.set_notice(
                            NoticeKind::Success,
                            format!("Logged in as {}", self.state.profile_label),
                        );
                    }
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            TaskEvent::Analyze(result) => {
                self.state.busy = None;
                match result {
                    Ok(creation) => {
                        self.state.current_thread = Some(CurrentThread {
                            id: creation.thread_id.clone(),
                            title: "New thread".to_string(),
                            ocr_job_id: creation.ocr_job_id,
                        });
                        self.state.set_notice(
                            NoticeKind::Success,
                            format!("Created image thread {}", creation.thread_id),
                        );
                        if self
                            .state
                            .current_thread
                            .as_ref()
                            .and_then(|thread| thread.ocr_job_id.as_ref())
                            .is_some()
                        {
                            self.state.busy = Some(format!(
                                "scanning image with {}",
                                self.state.ocr_language
                            ));
                        }
                    }
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            TaskEvent::Submission(result) => {
                self.state.busy = None;
                match result {
                    Ok(result) => self.state.set_notice(
                        NoticeKind::Success,
                        format!("log saved in {}", result.log_path.display()),
                    ),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            TaskEvent::GeneratedTitle(result) => {
                self.state.busy = None;
                match result {
                    Ok(title) => {
                        if let Some(thread) = self.state.current_thread.as_mut() {
                            thread.title = title.clone();
                        }
                        self.state
                            .set_notice(NoticeKind::Success, format!("Generated title: {title}"));
                    }
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            TaskEvent::Lens(result) => {
                self.state.busy = None;
                match result.and_then(|url| squigit::cli::open_external(&url).map(|()| url)) {
                    Ok(url) => self
                        .state
                        .set_notice(NoticeKind::Success, format!("Opened Google Lens: {url}")),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            TaskEvent::InstalledOcr(result) => {
                self.state.busy = None;
                match result {
                    Ok(()) => self
                        .state
                        .set_notice(NoticeKind::Success, "Squigit OCR installed"),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
            TaskEvent::Cancelled(result) => {
                self.state.busy = None;
                match result {
                    Ok(message) => self.state.set_notice(NoticeKind::Success, message),
                    Err(error) => self.state.set_notice(NoticeKind::Error, error),
                }
            }
        }
    }

    fn poll_ocr_job(&mut self) {
        let Some(job_id) = self
            .state
            .current_thread
            .as_ref()
            .and_then(|thread| thread.ocr_job_id.clone())
        else {
            return;
        };
        let Ok(jobs) = squigit::thread::ocr::get_ocr_jobs_snapshot() else {
            return;
        };
        let Some(job) = jobs.into_iter().find(|job| job.job_id == job_id) else {
            return;
        };
        match job.status.as_str() {
            "completed" => {
                self.state.busy = None;
                if let Some(thread) = self.state.current_thread.as_mut() {
                    thread.ocr_job_id = None;
                }
                if let Some(thread_id) = self
                    .state
                    .current_thread
                    .as_ref()
                    .map(|thread| thread.id.clone())
                {
                    match squigit::cli::load_ocr_text(&thread_id, Some(&job.model_id)) {
                        Ok(text) => {
                            self.state.ocr_text = text;
                            self.state.set_notice(
                                NoticeKind::Success,
                                "OCR complete. Press F1 to show recognized text.",
                            );
                        }
                        Err(error) => self.state.set_notice(NoticeKind::Error, error),
                    }
                }
            }
            "failed" => {
                self.state.busy = None;
                if let Some(thread) = self.state.current_thread.as_mut() {
                    thread.ocr_job_id = None;
                }
                let error = job.error.unwrap_or_else(|| "OCR failed".to_string());
                let tip = if error.to_ascii_lowercase().contains("not found")
                    || error.to_ascii_lowercase().contains("missing")
                {
                    " Run /install_ocr."
                } else {
                    ""
                };
                self.state
                    .set_notice(NoticeKind::Error, format!("{error}{tip}"));
            }
            "cancelled" => {
                self.state.busy = None;
                if let Some(thread) = self.state.current_thread.as_mut() {
                    thread.ocr_job_id = None;
                }
            }
            _ => {}
        }
    }

    fn poll_thread_title(&mut self) {
        let Some(current) = self.state.current_thread.as_mut() else {
            return;
        };
        if current.title != "New thread" {
            return;
        }
        let Ok(jobs) = squigit::thread::get_thread_jobs_snapshot() else {
            return;
        };
        let completed = jobs.iter().any(|job| {
            job.thread_id == current.id && matches!(job.status.as_str(), "completed" | "failed")
        });
        if !completed {
            return;
        }
        if let Ok(snapshot) = squigit::thread::ocr::load_ocr_thread(&current.id) {
            current.title = snapshot.thread_title;
        }
    }

    fn show_ocr(&mut self) {
        if self.state.ocr_text.is_empty() {
            let Some(thread_id) = self.current_thread_id() else {
                return;
            };
            match squigit::cli::load_ocr_text(&thread_id, None) {
                Ok(text) if !text.trim().is_empty() => self.state.ocr_text = text,
                Ok(_) => {
                    self.state
                        .set_notice(NoticeKind::Info, "No OCR text is available yet");
                    return;
                }
                Err(error) => {
                    self.state.set_notice(NoticeKind::Error, error);
                    return;
                }
            }
        }
        self.state.view = View::Ocr;
    }

    fn current_thread_id(&mut self) -> Option<String> {
        match &self.state.current_thread {
            Some(thread) => Some(thread.id.clone()),
            None => {
                self.no_thread_error();
                None
            }
        }
    }

    fn no_thread_error(&mut self) {
        self.state.set_notice(
            NoticeKind::Error,
            "No image thread is active. Run /analyze or /resume.",
        );
    }

    fn guest_key_error(&mut self) {
        self.state.return_home();
        self.state.set_notice(
            NoticeKind::Error,
            "API keys are unavailable in guest mode. Run /login.",
        );
    }

    fn select_previous(&mut self, length: usize) {
        if length == 0 {
            self.state.selected = 0;
        } else if self.state.selected == 0 {
            self.state.selected = length - 1;
        } else {
            self.state.selected -= 1;
        }
    }

    fn select_next(&mut self, length: usize) {
        if length > 0 {
            self.state.selected = (self.state.selected + 1) % length;
        }
    }

    fn escape(&mut self) {
        if self
            .state
            .busy
            .as_deref()
            .is_some_and(|busy| busy.contains("Google Lens"))
        {
            if let Some(thread_id) = self
                .state
                .current_thread
                .as_ref()
                .map(|thread| thread.id.clone())
            {
                let _ = squigit::thread::lens::cancel_reverse_image_search(&thread_id);
            }
        }
        if self
            .state
            .busy
            .as_deref()
            .is_some_and(|busy| busy.contains("browser login"))
        {
            let _ = squigit::profile::cancel_google_auth();
        }
        match self.state.view {
            View::Auth => self.state.quit = true,
            View::Home if self.state.busy.is_none() => self.state.quit = true,
            _ => self.state.return_home(),
        }
    }
}

fn back_item() -> MenuItem {
    MenuItem {
        section: String::new(),
        label: "Back".to_string(),
        detail: "Esc".to_string(),
        action: MenuAction::Back,
    }
}

fn provider_label(provider: &str) -> &str {
    match provider {
        "google-ai-studio" => "Gemini",
        "imgbb" => "ImgBB",
        other => other,
    }
}

fn configured_label(configured: bool) -> String {
    if configured {
        "configured".to_string()
    } else {
        "not configured".to_string()
    }
}

fn generate_pin() -> String {
    let value = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0)
        % 1_000_000;
    format!("{value:06}")
}
