// capture/build.rs
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let root = Path::new(&manifest_dir);
    
    // 1. Where is the C++ Engine?
    let qt_dist = root.join("dist"); // The output of your PKGBUILD
    
    // 2. Where should the Zip go?
    // We put it in 'src' so 'include_bytes!' can find it easily.
    let output_zip = root.join("src/capture_kit.zip");

    // Tell Cargo to re-run if the C++ build changes
    println!("cargo:rerun-if-changed={}", qt_dist.display());

    // 3. Validation
    if !qt_dist.exists() {
        // You can make this a hard error, or a warning if you want to allow 
        // "rust-only" dev (daemon logic only) without the engine.
        println!("cargo:warning=⚠️ C++ Engine not found at {:?}. Run PKGBUILD first!", qt_dist);
        return; 
    }

    // 4. Zip It Up
    // Since we are "Fearless", let's use the system zip command 
    // (or 7z on Win) to avoid extra Rust dependencies for build-time only.
    
    // Cleanup old zip
    if output_zip.exists() {
        let _ = fs::remove_file(&output_zip);
    }

    #[cfg(unix)]
    {
        // zip -r -j src/capture_kit.zip dist/* // (-j ignores directory structure, but we want the structure inside dist)
        // Actually, better to just zip the CONTENTS of dist.
        
        let status = Command::new("zip")
            .current_dir(&qt_dist)
            .arg("-r")
            .arg(&output_zip)
            .arg(".") // Zip everything in dist
            .status()
            .expect("Failed to run zip");

        if !status.success() {
            panic!("Failed to zip C++ engine");
        }
    }

    #[cfg(windows)]
    {
        // PowerShell zip command
        let status = Command::new("powershell")
            .arg("-Command")
            .arg(format!(
                "Compress-Archive -Path '{}/*' -DestinationPath '{}' -Force",
                qt_dist.display(),
                output_zip.display()
            ))
            .status()
            .expect("Failed to run powershell zip");
            
         if !status.success() {
            panic!("Failed to zip C++ engine");
        }
    }
}