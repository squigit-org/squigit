// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

#[tauri::command]
pub async fn cancel_request(channel_id: Option<String>) -> Result<(), String> {
    crate::brain::provider::gemini::agent::request_control::cancel_gemini_request(channel_id).await
}

#[tauri::command]
pub async fn quick_answer_request(channel_id: String) -> Result<(), String> {
    crate::brain::provider::gemini::agent::request_control::answer_now_gemini_request(channel_id)
        .await
}
