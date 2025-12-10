#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use interprocess::local_socket::LocalSocketStream;
use std::io::prelude::*;

fn kill_existing_daemon() {
    let name = if cfg!(windows) {
        "\\\\.\\pipe\\spatialshot_ipc_secret_v1"
    } else {
        "/tmp/spatialshot.ipc.sock"
    };

    if let Ok(mut conn) = LocalSocketStream::connect(name) {
        let _ = conn.write_all(b"EXECUTE_ORDER_66\n");
        std::thread::sleep(std::time::Duration::from_millis(500));
    } else {
        println!("No existing daemon found (or couldn't connect). Safe to proceed.");
    }
}

fn main() {
  kill_existing_daemon();
  app_lib::run();
}
