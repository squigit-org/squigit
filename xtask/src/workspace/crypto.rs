use crate::{Runtime, XtaskResult};
use std::path::Path;

pub fn keygen(runtime: &Runtime) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Generate a fresh RSA signing pair and write both keys securely.
    **************************/

    runtime.success("[mock] generating RSA key pair");
    println!("  public key: public.pem");
    println!("  private key: private.pem");
    Ok(())
}

pub fn sign(runtime: &Runtime, artifact: &Path, private_key_pem: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Hash the update artifact, sign it with the private key, and write its signature.
    **************************/

    let signature = artifact.with_extension("sig");
    runtime.success(&format!("[mock] signing {}", artifact.display()));
    println!(
        "  private key: YOUR_PRIV_KEY ({} bytes)",
        private_key_pem.len()
    );
    println!("  signature: {}", signature.display());
    Ok(())
}
