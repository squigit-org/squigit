// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit::brain::provider::models::AvailableModel;
use squigit::cli::CliSubmissionRequest;
use squigit::thread::{ImageThreadCreation, MessageAttachmentInput};
use squigit::update::{PendingUpdate, UpdateShell};
use std::path::PathBuf;
use tokio::sync::mpsc::UnboundedSender;

pub struct SubmissionOutcome {
    pub created_sidechat: Option<squigit::thread::SideChatCreation>,
    pub assistant_text: Option<String>,
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
    Models {
        request_id: u64,
        result: Result<Vec<AvailableModel>, String>,
    },
    Update(Result<Option<PendingUpdate>, String>),
    Login(Result<(), String>),
    Analyze(Result<ImageThreadCreation, String>),
    Submission(Result<SubmissionOutcome, String>),
    Response {
        conversation_id: String,
        result: Result<String, String>,
    },
    GeneratedTitle(Result<String, String>),
    Lens(Result<String, String>),
    Cancelled(Result<String, String>),
    KeySaved(Result<(), String>),
}

pub fn load_models(sender: &UnboundedSender<TaskEvent>, request_id: u64) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let result = squigit::brain::provider::models::list_available_models().await;
        let _ = sender.send(TaskEvent::Models { request_id, result });
    });
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
        let response_job = result.as_ref().ok().and_then(|creation| {
            creation
                .brain_job_id
                .as_ref()
                .map(|job| (creation.thread_id.clone(), job.clone()))
        });
        let _ = sender.send(TaskEvent::Analyze(result));
        if let Some((conversation_id, job_id)) = response_job {
            let result =
                squigit::thread::await_conversation_response(&conversation_id, &job_id).await;
            let _ = sender.send(TaskEvent::Response {
                conversation_id,
                result,
            });
        }
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
                model: task.model.clone(),
                effort: task.effort.clone(),
            })
            .await?;
            let inputs = submission
                .attachment_descriptors
                .iter()
                .map(|descriptor| MessageAttachmentInput {
                    attachment_hash: descriptor.hash.clone(),
                    source_path: Some(descriptor.source_path.clone()),
                    display_name: Some(descriptor.display_name.clone()),
                    file_type: Some(descriptor.file_type.clone()),
                })
                .collect::<Vec<_>>();
            let conversation_target: Option<String>;
            let created_sidechat =
                if let Some(sidechat_id) = task.thread_id.as_ref().filter(|_| task.is_sidechat) {
                    squigit::thread::append_message(
                        squigit::history::HistoryInterface::Cli,
                        sidechat_id,
                        submission.canonical_message.clone(),
                        inputs,
                        submission.text_citations.clone(),
                        None,
                    )?;
                    conversation_target = Some(sidechat_id.clone());
                    None
                } else if task.thread_id.is_none() {
                    let created = squigit::thread::create_sidechat_thread(
                        squigit::history::HistoryInterface::Cli,
                        task.model.clone(),
                        submission.canonical_message.clone(),
                        inputs,
                        submission.text_citations.clone(),
                        Some(task.human_text),
                        None,
                    )
                    .await?;
                    conversation_target = Some(created.sidechat_id.clone());
                    Some(created)
                } else if let Some(thread_id) = task.thread_id.clone() {
                    squigit::thread::append_message(
                        squigit::history::HistoryInterface::Cli,
                        &thread_id,
                        submission.canonical_message.clone(),
                        inputs,
                        submission.text_citations.clone(),
                        None,
                    )?;
                    conversation_target = Some(thread_id);
                    None
                } else {
                    return Err("Thread id is missing".to_string());
                };
            let assistant_text = match conversation_target {
                Some(conversation_id) => Some(
                    squigit::thread::generate_conversation_response(
                        &conversation_id,
                        task.model,
                        task.effort,
                        false,
                    )
                    .await?,
                ),
                None => None,
            };
            Ok(SubmissionOutcome {
                created_sidechat,
                assistant_text,
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

pub fn save_key(
    sender: &UnboundedSender<TaskEvent>,
    profile_id: String,
    provider: String,
    value: String,
) {
    let sender = sender.clone();
    tokio::spawn(async move {
        let secret = squigit::auth::SecretString::new(value);
        let result = squigit::settings::set_api_key(&profile_id, &provider, secret.expose()).await;
        let _ = sender.send(TaskEvent::KeySaved(result));
    });
}
pub fn cancel_brain_jobs(sender: &UnboundedSender<TaskEvent>) {
    for job in squigit::services::brain().jobs_snapshot() {
        if !job.is_terminal() {
            squigit::services::brain().cancel_job(&job.job_id);
        }
    }
    let _ = sender.send(TaskEvent::Cancelled(Ok("Responses stopped".to_string())));
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
