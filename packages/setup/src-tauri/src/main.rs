#[cfg(not(target_os = "linux"))]
use interprocess::local_socket::LocalSocketStream;
#[cfg(not(target_os = "linux"))]
use std::io::prelude::*;

#[cfg(not(target_os = "linux"))]
fn kill_existing_daemon() {
    let name = "/tmp/spatialshot.ipc.sock";

    if let Ok(mut conn) = LocalSocketStream::connect(name) {
        let _ = conn.write_all(b"EXECUTE_ORDER_66\n");
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

fn main() {
    #[cfg(not(target_os = "linux"))]
    kill_existing_daemon();

    app_lib::run();
}
