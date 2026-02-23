use tauri::{AppHandle, State};
use crate::state::AppState;

#[tauri::command]
pub fn spawn_capture_to_input(app: AppHandle, _state: State<'_, AppState>) -> Result<(), String> {
    crate::services::capture::spawn_capture_to_input(&app);
    Ok(())
}
