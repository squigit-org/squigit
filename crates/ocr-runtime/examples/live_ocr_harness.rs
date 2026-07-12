// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use ocr_runtime::models::ModelManager;
use ocr_runtime::ocr::{OcrRequest, OcrRuntime};
use std::env;
use std::path::{Path, PathBuf};

const CONFIG_DIR_ENV: &str = "SQUIGIT_CONFIG_DIR";
const REPO_ROOT_ENV: &str = "SQUIGIT_REPO_ROOT";

struct OcrModelDef {
    id: &'static str,
    name: &'static str,
    lang: &'static str,
    test_image: &'static str,
    download_url: &'static str,
}

const MODELS: &[OcrModelDef] = &[
    OcrModelDef {
        id: "pp-ocr-v5-en",
        name: "PP-OCR-V5 English",
        lang: "en",
        test_image: "test-en.png",
        download_url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/en_PP-OCRv5_mobile_rec_infer.tar",
    },
    OcrModelDef {
        id: "pp-ocr-v5-latin",
        name: "PP-OCR-V5 Latin",
        lang: "la",
        test_image: "test-latin.png",
        download_url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/latin_PP-OCRv5_mobile_rec_infer.tar",
    },
    OcrModelDef {
        id: "pp-ocr-v5-cyrillic",
        name: "PP-OCR-V5 Cyrillic",
        lang: "ru",
        test_image: "test-cyrillic.png",
        download_url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/cyrillic_PP-OCRv5_mobile_rec_infer.tar",
    },
    OcrModelDef {
        id: "pp-ocr-v5-korean",
        name: "PP-OCR-V5 Korean",
        lang: "ko",
        test_image: "test-korean.png",
        download_url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/korean_PP-OCRv5_mobile_rec_infer.tar",
    },
    OcrModelDef {
        id: "pp-ocr-v5-cjk",
        name: "PP-OCR-V5 CJK",
        lang: "ch",
        test_image: "test-cjk.png",
        download_url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_server_rec_infer.tar",
    },
    OcrModelDef {
        id: "pp-ocr-v5-devanagari",
        name: "PP-OCR-V5 Devanagari",
        lang: "hi",
        test_image: "test-devanagari.png",
        download_url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/devanagari_PP-OCRv5_mobile_rec_infer.tar",
    },
];

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let _config_dir = isolated_config_dir()?;
    let repo_root = repo_root()?;
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        return Err(
            "usage: cargo run -p ocr-runtime --example live_ocr_harness -- <analyze|download|models> ..."
                .to_string(),
        );
    };

    match command.as_str() {
        "analyze" => {
            let arg1 = args.next();
            let arg2 = args.next();

            let (image_arg, model_arg) = match (arg1, arg2) {
                (Some(a1), Some(a2)) => (Some(a1), Some(a2)),
                (Some(a1), None) => {
                    if resolve_model(&a1).is_some() {
                        (None, Some(a1))
                    } else {
                        (Some(a1), None)
                    }
                }
                _ => (None, None),
            };

            analyze(&repo_root, image_arg.as_deref(), model_arg.as_deref()).await?;
        }
        "download" => {
            let model = args
                .next()
                .ok_or_else(|| "download requires <model>".to_string())?;
            download(&model).await?;
        }
        "models" => {
            models()?;
        }
        other => return Err(format!("unknown command: {other}")),
    }

    Ok(())
}

fn isolated_config_dir() -> Result<PathBuf, String> {
    let path = env::var_os(CONFIG_DIR_ENV)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| {
            format!("{CONFIG_DIR_ENV} is required so the live harness cannot use app data")
        })?;
    if !path.is_absolute() {
        return Err(format!("{CONFIG_DIR_ENV} must be an absolute path"));
    }
    Ok(path)
}

fn repo_root() -> Result<PathBuf, String> {
    let path = env::var_os(REPO_ROOT_ENV)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| format!("{REPO_ROOT_ENV} is required to locate the packaged sidecar"))?;
    if !path.is_absolute() {
        return Err(format!("{REPO_ROOT_ENV} must be an absolute path"));
    }
    Ok(path)
}

/// Resolve a model specifier to its definition.
///
/// Accepts:
/// - Full model ID: `pp-ocr-v5-korean`
/// - Short lang alias: `ko`
/// - Filesystem path: `/path/to/model-dir` (returns None — handled by caller)
fn resolve_model(specifier: &str) -> Option<&'static OcrModelDef> {
    MODELS
        .iter()
        .find(|m| m.id == specifier || m.lang == specifier)
}

fn default_model() -> &'static OcrModelDef {
    &MODELS[0] // pp-ocr-v5-en
}

fn sidecar_binary(repo_root: &Path) -> Result<(PathBuf, PathBuf), String> {
    let triple = host_target_triple();
    let runtime_dir = repo_root
        .join("packaging/binaries")
        .join(format!("paddle-ocr-{triple}"));
    let binary_name = if cfg!(windows) {
        "squigit-ocr.exe"
    } else {
        "squigit-ocr"
    };
    let binary = runtime_dir.join(binary_name);
    if !binary.exists() {
        return Err(format!(
            "Packaged sidecar binary not found at {}.\n\
             Build it first: cargo xtask build (from sidecars/paddle-ocr)",
            binary.display()
        ));
    }
    Ok((binary, runtime_dir))
}

fn host_target_triple() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
}

fn test_assets_dir(repo_root: &Path) -> PathBuf {
    repo_root.join("crates/ocr-runtime/examples/assets")
}

async fn analyze(
    repo_root: &Path,
    image_arg: Option<&str>,
    model_arg: Option<&str>,
) -> Result<(), String> {
    let model_def = model_arg
        .and_then(resolve_model)
        .or_else(|| Some(default_model()));

    // Determine if model_arg is a filesystem path (not a known ID/alias).
    let model_path_override = model_arg.and_then(|spec| {
        if resolve_model(spec).is_some() {
            None
        } else {
            let path = PathBuf::from(spec);
            if path.exists() {
                Some(path)
            } else {
                None
            }
        }
    });

    let effective_model = model_def.unwrap_or_else(|| {
        // If model_arg was given but didn't resolve to a known model,
        // it's either a path or invalid. Use default for test image selection.
        default_model()
    });

    // Resolve image path.
    let image_path = match image_arg {
        Some(path) => {
            let path = PathBuf::from(path);
            if !path.exists() {
                return Err(format!("Image not found: {}", path.display()));
            }
            path
        }
        None => {
            let assets = test_assets_dir(repo_root);
            let image = assets.join(effective_model.test_image);
            if !image.exists() {
                return Err(format!(
                    "Default test image not found: {}\nExpected at: {}",
                    effective_model.test_image,
                    image.display()
                ));
            }
            println!(
                "[ocr] Using test image: {} ({})",
                effective_model.test_image, effective_model.name
            );
            image
        }
    };

    // Resolve rec model dir override.
    let rec_model_dir = if let Some(path) = model_path_override {
        println!("[ocr] Using local model dir: {}", path.display());
        Some(path)
    } else if let Some(model) = model_def {
        // Check if a non-default rec model is downloaded.
        if model.id != "pp-ocr-v5-en" {
            let manager = ModelManager::new().map_err(|e| e.to_string())?;
            let model_dir = manager.get_model_dir(model.id);
            if manager.is_model_installed(model.id) {
                println!("[ocr] Using downloaded model: {} ({})", model.name, model.id);
                Some(model_dir)
            } else {
                return Err(format!(
                    "Model '{}' is not installed.\nRun: cargo xtask live ocr download {}",
                    model.id, model.id
                ));
            }
        } else {
            // English is the bundled default — no override needed.
            println!("[ocr] Using bundled default model (English)");
            None
        }
    } else {
        None
    };

    let (sidecar_path, runtime_dir) = sidecar_binary(repo_root)?;
    println!(
        "[ocr] Sidecar: {}\n[ocr] Image: {}",
        sidecar_path.display(),
        image_path.display()
    );

    let runtime = OcrRuntime::new();
    let request = OcrRequest {
        sidecar_path,
        runtime_dir: Some(runtime_dir),
        image_path,
        rec_model_dir_override: rec_model_dir,
        timeout_secs: Some(120),
    };

    println!("[ocr] Running OCR inference...");
    let result = runtime.run(request).await.map_err(|e| e.to_string())?;

    println!("\n--- OCR Result ---");
    println!("Raw text:\n{}", result.raw_text);
    println!("\nBoxes: {}", result.boxes.len());
    for (i, ocr_box) in result.boxes.iter().enumerate() {
        println!(
            "  [{i}] text=\"{}\"  confidence={:.2}",
            ocr_box.text, ocr_box.confidence
        );
    }
    println!("--- End ---");

    Ok(())
}

async fn download(model_specifier: &str) -> Result<(), String> {
    let model = resolve_model(model_specifier).ok_or_else(|| {
        format!(
            "Unknown model '{}'. Use a model ID (e.g. pp-ocr-v5-korean) or lang code (e.g. ko).",
            model_specifier
        )
    })?;

    println!(
        "[ocr] Downloading {} ({})...",
        model.name, model.id
    );

    let manager = ModelManager::new().map_err(|e| e.to_string())?;

    if manager.is_model_installed(model.id) {
        println!(
            "[ocr] Model '{}' is already installed at {:?}",
            model.id,
            manager.get_model_dir(model.id)
        );
        return Ok(());
    }

    manager
        .download_and_extract(model.download_url, model.id, |progress| {
            if progress.total > 0 {
                eprint!(
                    "\r  [{}] {}% ({}/{} bytes)    ",
                    progress.status, progress.progress, progress.loaded, progress.total
                );
            } else {
                eprint!("\r  [{}] {} bytes loaded    ", progress.status, progress.loaded);
            }
        })
        .await
        .map_err(|e| e.to_string())?;

    eprintln!();
    println!(
        "[ocr] Model '{}' installed at {:?}",
        model.id,
        manager.get_model_dir(model.id)
    );

    Ok(())
}

fn models() -> Result<(), String> {
    let manager = ModelManager::new().map_err(|e| e.to_string())?;
    let downloaded = manager.list_downloaded_models().map_err(|e| e.to_string())?;

    // Installed models.
    println!("Installed Models\n");
    let installed: Vec<&OcrModelDef> = MODELS
        .iter()
        .filter(|m| m.id == "pp-ocr-v5-en" || downloaded.iter().any(|d| d == m.id))
        .collect();

    if installed.is_empty() {
        println!("  No models installed.");
    } else {
        println!("  {:<24} {:<26} Lang", "ID", "Name");
        for model in &installed {
            let name = if model.id == "pp-ocr-v5-en" {
                format!("{} (bundled)", model.name)
            } else {
                model.name.to_string()
            };
            println!("  {:<24} {:<26} {}", model.id, name, model.lang);
        }
    }

    // Available to download.
    let available: Vec<&OcrModelDef> = MODELS
        .iter()
        .filter(|m| m.id != "pp-ocr-v5-en" && !downloaded.iter().any(|d| d == m.id))
        .collect();

    if !available.is_empty() {
        println!("\nAvailable to Download\n");
        println!("  {:<24} {:<26} Lang", "ID", "Name");
        for model in &available {
            println!("  {:<24} {:<26} {}", model.id, model.name, model.lang);
        }
    }

    println!("\nModels directory: {}", manager.models_dir().display());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_model_by_full_id() {
        let model = resolve_model("pp-ocr-v5-korean").unwrap();
        assert_eq!(model.id, "pp-ocr-v5-korean");
        assert_eq!(model.lang, "ko");
    }

    #[test]
    fn resolves_model_by_short_alias() {
        let model = resolve_model("ko").unwrap();
        assert_eq!(model.id, "pp-ocr-v5-korean");
    }

    #[test]
    fn resolves_all_lang_aliases() {
        for expected in MODELS {
            let resolved = resolve_model(expected.lang)
                .unwrap_or_else(|| panic!("failed to resolve alias '{}'", expected.lang));
            assert_eq!(resolved.id, expected.id);
        }
    }

    #[test]
    fn unknown_model_returns_none() {
        assert!(resolve_model("pp-ocr-v5-arabic").is_none());
        assert!(resolve_model("zz").is_none());
    }

    #[test]
    fn default_model_is_english() {
        assert_eq!(default_model().id, "pp-ocr-v5-en");
    }

    #[test]
    fn model_registry_matches_the_app() {
        assert_eq!(MODELS.len(), 6);
        let ids: Vec<&str> = MODELS.iter().map(|m| m.id).collect();
        assert!(ids.contains(&"pp-ocr-v5-en"));
        assert!(ids.contains(&"pp-ocr-v5-latin"));
        assert!(ids.contains(&"pp-ocr-v5-cyrillic"));
        assert!(ids.contains(&"pp-ocr-v5-korean"));
        assert!(ids.contains(&"pp-ocr-v5-cjk"));
        assert!(ids.contains(&"pp-ocr-v5-devanagari"));
    }
}
