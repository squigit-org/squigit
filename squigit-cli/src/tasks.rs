// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit::cli::{CliSubmissionRequest, CliSubmissionResult};
use squigit::thread::ImageThreadCreation;
use squigit::update::{PendingUpdate, UpdateShell};
use std::path::PathBuf;
use tokio::sync::mpsc::UnboundedSender;

pub struct SubmissionOutcome {
    pub result: CliSubmissionResult,
    pub created_sidechat: Option<squigit::thread::SideChatCreation>,
}

pub(crate) struct SubmissionTask {
    pub(crate) message_markdown: String,
    pub(crate) human_text: String,
    pub(crate) attachment_paths: Vec<PathBuf>,
    pub(crate) thread_id: Option<String>,
    pub(crate) is_sidechat: bool,
    pub(crate) model: String,
    pub(crate) effort: String,
}

pub enum TaskEvent {
    Update(Result<Option<PendingUpdate>, String>),
    Login(Result<(), String>),
    Analyze(Result<ImageThreadCreation, String>),
    Submission(Result<SubmissionOutcome, String>),
    GeneratedTitle(Result<String, String>),
    Lens(Result<String, String>),
    Cancelled(Result<String, String>),
}

pub fn refresh_updates(sender: &UnboundedSender<TaskEvent>) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = async {
            squigit::update::refresh_cli_version_file(env!("CARGO_PKG_VERSION").to_string())
                .await
                .map_err(|error| error.to_string())?;
            squigit::update::decide_update(UpdateShell::Cli).map_err(|error| error.to_string())
        }
        .await;
        let _ = sender.send(TaskEvent::Update(result));
    });
}

pub fn login(sender: &UnboundedSender<TaskEvent>) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::profile::start_google_auth()
            .await
            .map(|_| ())
            .map_err(|error| error.to_string());
        let _ = sender.send(TaskEvent::Login(result));
    });
}

pub fn analyze(sender: &UnboundedSender<TaskEvent>, source_path: PathBuf) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = async {
            let creation_id = squigit::thread::prepare_image_thread_creation().await?;
            let creation = squigit::thread::create_image_thread(
                creation_id.clone(),
                source_path.to_string_lossy().into_owned(),
                None,
            )
            .await;
            let release = squigit::thread::cancel_image_thread_creation(&creation_id);
            match (creation, release) {
                (Ok(creation), Ok(())) => Ok(creation),
                (Err(error), _) => Err(error),
                (Ok(_), Err(error)) => Err(error),
            }
        }
        .await;
        let _ = sender.send(TaskEvent::Analyze(result));
    });
}

pub fn submit(sender: &UnboundedSender<TaskEvent>, task: SubmissionTask) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = async {
            let submission = squigit::cli::submit_message(CliSubmissionRequest {
                message: task.message_markdown,
                attachment_paths: task.attachment_paths,
                thread_id: task.thread_id.clone(),
                model: task.model,
                effort: task.effort,
            })
            .await?;
            let created_sidechat =
                if let Some(sidechat_id) = task.thread_id.as_ref().filter(|_| task.is_sidechat) {
                    squigit::thread::append_sidechat_message(
                        sidechat_id,
                        submission.canonical_message.clone(),
                        submission.attachment_hashes.clone(),
                    )?;
                    None
                } else if task.thread_id.is_none() {
                    Some(
                        squigit::thread::create_sidechat_thread(
                            submission.canonical_message.clone(),
                            submission.attachment_hashes.clone(),
                            Some(task.human_text),
                        )
                        .await?,
                    )
                } else {
                    None
                };
            Ok(SubmissionOutcome {
                result: submission,
                created_sidechat,
            })
        }
        .await;
        let _ = sender.send(TaskEvent::Submission(result));
    });
}

pub fn generate_title(sender: &UnboundedSender<TaskEvent>, thread_id: String) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::explorer::suggest_thread_title(thread_id).await;
        let _ = sender.send(TaskEvent::GeneratedTitle(result));
    });
}

pub fn generate_sidechat_title(sender: &UnboundedSender<TaskEvent>, sidechat_id: String) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::explorer::suggest_sidechat_title(sidechat_id).await;
        let _ = sender.send(TaskEvent::GeneratedTitle(result));
    });
}

pub fn lens(sender: &UnboundedSender<TaskEvent>, thread_id: String) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::thread::lens::reverse_image_search_url(&thread_id, None)
            .await
            .map(|outcome| outcome.opened_url);
        let _ = sender.send(TaskEvent::Lens(result));
    });
}

pub fn cancel_attachment_jobs(sender: &UnboundedSender<TaskEvent>) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::services::brain()
            .cancel_all_attachment_jobs()
            .await
            .map(|()| "Attachment jobs cancelled".to_string());
        let _ = sender.send(TaskEvent::Cancelled(result));
    });
}

pub fn cancel_ocr_job(sender: &UnboundedSender<TaskEvent>, job_id: String) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::thread::ocr::cancel_ocr_job(&job_id)
            .await
            .map(|()| format!("OCR job {job_id} cancelled"));
        let _ = sender.send(TaskEvent::Cancelled(result));
    });
}
