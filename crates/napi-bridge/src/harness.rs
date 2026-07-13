// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;

#[napi(object)]
pub struct NapiHarnessTextAttachment {
    pub path: String,
    pub display_name: String,
    pub extension: String,
    pub char_count: u32,
    pub ok: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[napi(object)]
pub struct NapiHarnessTextFirstMessage {
    pub message_text: String,
    pub attachments: Vec<NapiHarnessTextAttachment>,
    pub consumed_paths: Vec<String>,
}

impl From<squigit_harness::TextAttachmentResult> for NapiHarnessTextAttachment {
    fn from(value: squigit_harness::TextAttachmentResult) -> Self {
        Self {
            path: value.path,
            display_name: value.display_name,
            extension: value.extension,
            char_count: value.char_count.min(u32::MAX as usize) as u32,
            ok: value.ok,
            error_code: value.error_code,
            error_message: value.error_message,
        }
    }
}

impl From<squigit_harness::TextFirstMessage> for NapiHarnessTextFirstMessage {
    fn from(value: squigit_harness::TextFirstMessage) -> Self {
        Self {
            message_text: value.message_text,
            attachments: value.attachments.into_iter().map(Into::into).collect(),
            consumed_paths: value.consumed_paths,
        }
    }
}

#[napi(js_name = "prepare_text_first_message")]
pub fn prepare_text_first_message(
    message_text: String,
    text_attachment_paths: Vec<String>,
) -> Result<NapiHarnessTextFirstMessage> {
    squigit_harness::prepare_text_first_message(squigit_harness::PrepareTextFirstMessageInput {
        message_text,
        text_attachment_paths,
    })
    .map(Into::into)
    .map_err(Error::from_reason)
}
