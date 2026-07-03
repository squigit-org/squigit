use crate::{Runtime, XtaskResult};

pub fn analyze(runtime: &Runtime, image: &str, message: &[String]) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Analyze an image with the configured provider in an isolated temporary thread.
    **************************/

    runtime.success("[mock] live brain analyze");
    println!("  image: {image}");
    println!("  message: {}", message.join(" "));
    println!("  provider key: PROVIDER_API_KEY from the terminal environment");
    Ok(())
}

pub fn prompt(runtime: &Runtime, thread: &str, message: &[String]) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Continue an isolated provider thread with the supplied message.
    **************************/

    runtime.success("[mock] live brain prompt");
    println!("  thread: {thread}");
    println!("  message: {}", message.join(" "));
    Ok(())
}

pub fn threads(runtime: &Runtime) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Load and list thread metadata from the isolated temporary configuration.
    **************************/

    runtime.heading("Temporary Threads");
    println!("\n{:<14} Title", "ID");
    println!("{:<14} Image analysis smoke test", "thread-001");
    println!(
        "\nConfig: {}",
        runtime.temp_root.join("live/userData").display()
    );
    Ok(())
}
