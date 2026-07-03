use crate::{Runtime, XtaskResult};
use std::fs;

pub const MODELS: [&str; 3] = ["ppv3-en", "ppv3-ar", "ppv3-fr"];

pub fn analyze(runtime: &Runtime, image: Option<&str>, model: Option<&str>) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Load the requested OCR model, prepare an image, and run isolated inference.
    **************************/

    runtime.success(&format!(
        "[mock] live OCR model: {}",
        model.unwrap_or("ppv3-en (default)")
    ));
    println!(
        "  image: {}",
        image.unwrap_or("generated English sample image")
    );
    Ok(())
}

pub fn download(runtime: &Runtime, model: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Download, extract, and validate the requested OCR model in the temporary cache.
    **************************/

    runtime.success(&format!("[mock] downloading {model}"));
    println!(
        "  destination: {}",
        runtime.model_root().join(model).display()
    );
    Ok(())
}

pub fn models(runtime: &Runtime) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Inspect the temporary OCR cache and list every locally available model.
    **************************/

    runtime.heading("Paddle OCR Models");
    println!("\nCache:\n  {}\n\nModels:", runtime.model_root().display());
    let mut models = fs::read_dir(runtime.model_root())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect::<Vec<_>>();
    models.sort();
    if models.is_empty() {
        println!("  No downloaded models found.");
    } else {
        for model in models {
            println!("  {model}");
        }
    }
    Ok(())
}
