pub mod audmgr;
pub mod capture;
pub mod launcher;
pub mod watchdog;

#[cfg(not(target_os = "linux"))]
pub mod hotkey;

#[cfg(not(target_os = "linux"))]
pub mod ipc;