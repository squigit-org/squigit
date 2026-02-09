// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::{Builder, Manager};

pub mod state;
pub mod utils;

pub mod commands;
pub mod services;

use commands::auth::{cache_avatar, get_api_key, get_user_data, logout, start_google_auth, cancel_google_auth};
use commands::chat::{
    append_chat_message, create_chat, delete_chat,
    get_image_path, get_imgbb_url, get_ocr_data, list_chats, load_chat,
    overwrite_chat_messages, save_imgbb_url, save_ocr_data, store_image_bytes,
    store_image_from_path, update_chat_metadata,
};
use commands::clipboard::{
    copy_image_to_clipboard, read_clipboard_image, read_clipboard_text,
    copy_image_from_path_to_clipboard,
};
use commands::image::{
    get_initial_image, process_image_bytes, process_image_path, read_image_file, copy_image_to_path,
};
use commands::ocr::ocr_image;
use commands::profile::{
    get_active_profile, get_active_profile_id, set_active_profile,
    list_profiles, delete_profile, has_profiles, get_profile_count,
};
use commands::security::{check_file_exists, encrypt_and_save};
use commands::window::{
    close_imgbb_window, close_window, maximize_window, minimize_window,
    open_external_url, open_imgbb_window, resize_window, set_background_color,
};
use commands::speech::SpeechState;
use services::image::process_and_store_image;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    std::env::set_var("GDK_BACKEND", "x11");

    Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .manage(SpeechState::default())
        .invoke_handler(tauri::generate_handler![
            // Image processing (legacy)
            process_image_path,
            process_image_bytes,
            read_image_file,
            get_initial_image,
            // Clipboard
            // Clipboard

            read_clipboard_image,
            read_clipboard_text,
            copy_image_to_clipboard,
            copy_image_from_path_to_clipboard,
            // Security
            encrypt_and_save,
            check_file_exists,
            // Auth
            get_api_key,
            start_google_auth,
            cancel_google_auth,
            logout,
            get_user_data,
            cache_avatar,
            
            // Gemini
            commands::gemini::stream_gemini_chat,

            // Window
            open_imgbb_window,
            close_imgbb_window,
            open_external_url,
            resize_window,
            set_background_color,
            minimize_window,
            maximize_window,
            close_window,
            // OCR
            ocr_image,
            // CAS Image Storage
            store_image_bytes,
            store_image_from_path,
            get_image_path,
            // Chat Storage
            create_chat,
            load_chat,
            list_chats,
            delete_chat,
            update_chat_metadata,
            append_chat_message,
            overwrite_chat_messages,
            // OCR Storage
            save_ocr_data,
            get_ocr_data,
            // ImgBB Storage
            save_imgbb_url,
            get_imgbb_url,
            // Native File IO
            copy_image_to_path,
            // Profile Management
            get_active_profile,
            get_active_profile_id,
            set_active_profile,
            list_profiles,
            delete_profile,
            has_profiles,
            get_profile_count,
            // Theme
            commands::theme::get_system_theme,
            // Sound
            commands::sound::play_pop_sound,
            // Speech
            commands::speech::start_stt,
            commands::speech::stop_stt,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let args: Vec<String> = std::env::args().collect();
            let has_cli_image = args.iter().skip(1).find(|arg| !arg.starts_with("-"));

            if let Some(path) = has_cli_image.clone() {
                println!("CLI Image argument detected: {}", path);
                let state = handle.state::<AppState>();
                let _ = process_and_store_image(path.clone(), &state);
            }

            let (base_w, base_h) = if has_cli_image.is_some() {
                (1030.0, 690.0)
            } else {
                (690.0, 1030.0)
            };

            services::window::spawn_app_window(
                &handle,
                "main",
                "index.html",
                base_h,
                base_w,
                "",
            )
            .expect("Failed to spawn main window");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
