use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, action: &str, subject: Option<&str>) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Run the selected auth flow against an isolated temporary profile store.
    **************************/

    if action == "profiles" {
        runtime.heading("Isolated Profiles");
        println!("\n{:<14} {:<28} Status", "ID", "Email");
        println!("{:<14} {:<28} active", "profile-001", "example@squigit.com");
        println!(
            "{:<14} {:<28} inactive",
            "profile-002", "reviewer@squigit.com"
        );
    } else {
        runtime.success(&format!("[mock] live auth {action}"));
        if let Some(subject) = subject {
            println!("  subject: {subject}");
        }
    }
    println!(
        "  config: {}",
        runtime.temp_root.join("live/userData").display()
    );
    Ok(())
}
