/*
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use tauri::{Builder, Emitter, Manager};

pub mod state;
pub mod utils;

pub mod commands;
pub mod services;

use commands::auth::{get_api_key, get_user_data, logout, reset_api_key, start_google_auth};
use commands::clipboard::{start_clipboard_watcher, stop_clipboard_watcher};
use commands::image::{
    get_initial_image, process_image_bytes, process_image_path, read_image_file,
};
use commands::ocr::ocr_image;
use commands::security::{check_file_exists, encrypt_and_save};
use commands::window::{
    clear_cache, close_imgbb_window, open_external_url, open_imgbb_window, resize_window,
};
use services::image::process_and_store_image;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            process_image_path,
            process_image_bytes,
            read_image_file,
            get_initial_image,
            start_clipboard_watcher,
            stop_clipboard_watcher,
            encrypt_and_save,
            check_file_exists,
            get_api_key,
            reset_api_key,
            start_google_auth,
            logout,
            get_user_data,
            open_imgbb_window,
            close_imgbb_window,
            open_external_url,
            clear_cache,
            resize_window,
            ocr_image,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let args: Vec<String> = std::env::args().collect();
            let has_cli_image = args.iter().skip(1).find(|arg| !arg.starts_with("-"));

            // Process CLI image if present
            if let Some(path) = has_cli_image.clone() {
                println!("CLI Image argument detected: {}", path);
                let state = handle.state::<AppState>();
                if let Ok(_data_url) = process_and_store_image(path, &state) {
                    let _ = handle.emit("image-path", path);
                }
            }

            // Use chat size for CLI image, onboarding size otherwise
            // Chat: 1030x690 (landscape), Onboarding: 690x1030 (would be adjusted by frontend)
            let (base_w, base_h) = if has_cli_image.is_some() {
                (1030.0, 690.0) // Chat/Editor layout size
            } else {
                (690.0, 1030.0) // Onboarding size (will be resized by frontend)
            };

            services::window::spawn_app_window(
                &handle,
                "main",
                "index.html",
                base_h, // Note: spawn_app_window takes (base_w, base_h) but uses them for ratio
                base_w,
                "spatialshot",
            )
            .expect("Failed to spawn main window");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
