#![windows_subsystem = "windows"]

use std::process::Command;
use std::ptr::null_mut;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, MOD_SHIFT, MOD_WIN};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, TranslateMessage, MSG, WM_HOTKEY,
};

fn main() {
    unsafe {
        // ID for the hotkey (arbitrary unique identifier)
        const HOTKEY_ID: i32 = 1;
        
        // 'A' key code is 0x41
        const VK_A: u32 = 0x41;

        // Register Win + Shift + A
        // FIX: We use null_mut() because HWND expects a pointer, not an integer
        let register_result = RegisterHotKey(
            HWND(null_mut()), 
            HOTKEY_ID, 
            MOD_WIN | MOD_SHIFT, 
            VK_A
        );

        if register_result.is_err() {
            return; 
        }

        // Message Loop
        let mut msg = MSG::default();
        
        // FIX: We use null_mut() here as well
        while GetMessageW(&mut msg, HWND(null_mut()), 0, 0).as_bool() {
            if msg.message == WM_HOTKEY {
                // Check if the hotkey ID matches ours
                if msg.wParam.0 as i32 == HOTKEY_ID {
                    launch_main_app();
                }
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

fn launch_main_app() {
    // IMPORTANT: Ensure this filename matches your actual main app executable name
    let app_name = "kernel.exe"; 

    // We spawn the process and let it detach. 
    // We do not unwrap() or expect() because if it fails, we want to stay silent.
    let _ = Command::new(app_name).spawn();
}