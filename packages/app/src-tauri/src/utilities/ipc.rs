use std::io::{BufReader, prelude::*};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use interprocess::local_socket::{LocalSocketListener, NameTypeSupport};

pub fn start_shutdown_listener() {
    thread::spawn(move || {
        let name = if cfg!(windows) {
            "\\\\.\\pipe\\spatialshot_ipc_secret_v1"
        } else {
            "/tmp/spatialshot.ipc.sock"
        };

        #[cfg(unix)]
        if std::fs::metadata(name).is_ok() {
            let _ = std::fs::remove_file(name);
        }

        let listener = match LocalSocketListener::bind(name) {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to bind IPC listener: {}", e);
                return;
            }
        };

        log::info!("IPC Suicide Listener active.");

        for conn in listener.incoming().filter_map(|c| c.ok()) {
            let mut reader = BufReader::new(conn);
            let mut buffer = String::new();
            
            if reader.read_line(&mut buffer).is_ok() {
                let cmd = buffer.trim();
                if cmd == "EXECUTE_ORDER_66" {
                    log::warn!("Kill signal received from Installer. Shutting down.");
                    std::process::exit(0);
                }
            }
        }
    });
}
