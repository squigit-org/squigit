use crate::{Runtime, XtaskResult};
use base64::{engine::general_purpose, Engine as _};
use ed25519_dalek::pkcs8::spki::der::pem::LineEnding;
use ed25519_dalek::{
    pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey},
    Signer, SigningKey,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SIGNATURE_FORMAT: &str = "squigit.ota.signature.v1";
const SIGNATURE_ALGORITHM: &str = "ed25519";
const HASH_ALGORITHM: &str = "sha256";

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SignatureEnvelope {
    format: String,
    algorithm: String,
    hash: String,
    key_id: String,
    artifact_length: u64,
    artifact_sha256: String,
    signature: String,
}

pub fn keygen(runtime: &Runtime) -> XtaskResult {
    let public_path = runtime
        .repo_root
        .join("crates/squigit-auth/assets/crypto/pub.pem");
    let private_path = runtime.repo_root.join("priv.pem");
    refuse_existing_key(&public_path)?;
    refuse_existing_key(&private_path)?;

    let public_parent = public_path.parent().ok_or_else(|| {
        format!(
            "Public key output path has no parent directory: {}",
            public_path.display()
        )
    })?;
    fs::create_dir_all(public_parent).map_err(|error| {
        format!(
            "Could not create public key directory {}: {error}",
            public_parent.display()
        )
    })?;

    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    let private_pem = signing_key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|error| format!("Could not encode private key as PKCS#8 PEM: {error}"))?;
    let public_pem = signing_key
        .verifying_key()
        .to_public_key_pem(LineEnding::LF)
        .map_err(|error| format!("Could not encode public key as PEM: {error}"))?;

    write_new_file(&private_path, private_pem.as_bytes(), true)?;
    if let Err(error) = write_new_file(&public_path, public_pem.as_bytes(), false) {
        let _ = fs::remove_file(&private_path);
        return Err(error);
    }

    runtime.success("Generated Ed25519 signing key pair");
    println!("  public key: {}", runtime.relative_path(&public_path));
    println!("  private key: {}", runtime.relative_path(&private_path));
    Ok(())
}

pub fn sign(runtime: &Runtime, artifact: &Path, private_key_pem: &str) -> XtaskResult {
    if private_key_pem.trim().is_empty() {
        return Err("YOUR_PRIV_KEY contains an empty private key.".to_string());
    }

    let signing_key = SigningKey::from_pkcs8_pem(private_key_pem.trim())
        .map_err(|error| format!("YOUR_PRIV_KEY is not a valid Ed25519 PKCS#8 PEM: {error}"))?;
    let (artifact_length, artifact_digest) = hash_artifact(artifact)?;
    let key_id = key_id(&signing_key.verifying_key().to_bytes());
    let artifact_sha256 = hex::encode(artifact_digest);
    let canonical = canonical_payload(&key_id, artifact_length, &artifact_sha256);
    let signature = signing_key.sign(canonical.as_bytes());
    let envelope = SignatureEnvelope {
        format: SIGNATURE_FORMAT.to_string(),
        algorithm: SIGNATURE_ALGORITHM.to_string(),
        hash: HASH_ALGORITHM.to_string(),
        key_id,
        artifact_length,
        artifact_sha256,
        signature: general_purpose::STANDARD.encode(signature.to_bytes()),
    };
    let mut encoded = serde_json::to_vec_pretty(&envelope)
        .map_err(|error| format!("Could not encode artifact signature: {error}"))?;
    encoded.push(b'\n');

    let signature_path = artifact.with_extension("sig");
    write_atomic(&signature_path, &encoded)?;

    runtime.success(&format!("Signed {}", runtime.relative_path(artifact)));
    println!("  signature: {}", runtime.relative_path(&signature_path));
    Ok(())
}

fn refuse_existing_key(path: &Path) -> XtaskResult {
    if path.exists() {
        return Err(format!(
            "Refusing to overwrite existing key {}. Move or remove it first.",
            path.display()
        ));
    }
    Ok(())
}

fn write_new_file(path: &Path, contents: &[u8], private: bool) -> XtaskResult {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    #[cfg(not(unix))]
    let _ = private;

    let mut file = options
        .open(path)
        .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
    file.write_all(contents)
        .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    file.sync_all()
        .map_err(|error| format!("Could not flush {}: {error}", path.display()))?;
    Ok(())
}

fn hash_artifact(path: &Path) -> Result<(u64, [u8; 32]), String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Could not open artifact {}: {error}", path.display()))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Could not inspect artifact {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!(
            "Artifact is not a regular file: {}",
            path.display()
        ));
    }

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut length = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read artifact {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        length = length
            .checked_add(read as u64)
            .ok_or_else(|| format!("Artifact is too large: {}", path.display()))?;
        hasher.update(&buffer[..read]);
    }
    Ok((length, hasher.finalize().into()))
}

fn key_id(public_key: &[u8; 32]) -> String {
    hex::encode(Sha256::digest(public_key))
}

fn canonical_payload(key_id: &str, artifact_length: u64, artifact_sha256: &str) -> String {
    format!(
        "format={SIGNATURE_FORMAT}\nalgorithm={SIGNATURE_ALGORITHM}\nhash={HASH_ALGORITHM}\nkey_id={key_id}\nartifact_length={artifact_length}\nartifact_sha256={artifact_sha256}\n"
    )
}

fn temp_path_for(path: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut random = OsRng;
    let nonce = random.next_u64();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("signature");
    path.with_file_name(format!(
        ".{file_name}.tmp-{}-{timestamp}-{nonce}",
        std::process::id()
    ))
}

fn write_atomic(path: &Path, contents: &[u8]) -> XtaskResult {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "Signature output path has no parent directory: {}",
            path.display()
        )
    })?;
    if !parent.exists() {
        return Err(format!(
            "Signature output directory does not exist: {}",
            parent.display()
        ));
    }

    let temp_path = temp_path_for(path);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| {
                format!(
                    "Could not create temporary signature {}: {error}",
                    temp_path.display()
                )
            })?;
        file.write_all(contents).map_err(|error| {
            format!(
                "Could not write temporary signature {}: {error}",
                temp_path.display()
            )
        })?;
        file.sync_all().map_err(|error| {
            format!(
                "Could not flush temporary signature {}: {error}",
                temp_path.display()
            )
        })?;

        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(path).map_err(|error| {
                format!("Could not replace signature {}: {error}", path.display())
            })?;
        }
        fs::rename(&temp_path, path)
            .map_err(|error| format!("Could not publish signature {}: {error}", path.display()))
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Console;
    use ed25519_dalek::pkcs8::{DecodePrivateKey, DecodePublicKey};
    use tempfile::tempdir;

    fn runtime(root: &Path) -> Runtime {
        Runtime {
            console: Console::plain(),
            repo_root: root.to_path_buf(),
            temp_root: root.join("temp"),
        }
    }

    #[test]
    fn keygen_creates_matching_standard_pem_keys_without_overwriting() {
        let directory = tempdir().unwrap();
        let runtime = runtime(directory.path());
        keygen(&runtime).unwrap();

        let private_pem = fs::read_to_string(directory.path().join("priv.pem")).unwrap();
        let public_path = directory
            .path()
            .join("crates/squigit-auth/assets/crypto/pub.pem");
        let public_pem = fs::read_to_string(&public_path).unwrap();
        assert!(private_pem.starts_with("-----BEGIN PRIVATE KEY-----"));
        assert!(public_pem.starts_with("-----BEGIN PUBLIC KEY-----"));
        assert!(!directory.path().join("pub.pem").exists());

        let private = SigningKey::from_pkcs8_pem(&private_pem).unwrap();
        let public = ed25519_dalek::VerifyingKey::from_public_key_pem(&public_pem).unwrap();
        assert_eq!(private.verifying_key(), public);
        assert!(keygen(&runtime)
            .unwrap_err()
            .contains("Refusing to overwrite"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(directory.path().join("priv.pem"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn sign_writes_a_verifiable_envelope_and_replaces_it() {
        let directory = tempdir().unwrap();
        let runtime = runtime(directory.path());
        keygen(&runtime).unwrap();
        let private_pem = fs::read_to_string(directory.path().join("priv.pem")).unwrap();
        let artifact = directory.path().join("renderer.zip");
        fs::write(&artifact, b"renderer-v1").unwrap();

        sign(&runtime, &artifact, &private_pem).unwrap();
        let first = fs::read_to_string(directory.path().join("renderer.sig")).unwrap();
        let envelope: SignatureEnvelope = serde_json::from_str(&first).unwrap();
        assert_eq!(envelope.format, SIGNATURE_FORMAT);
        assert_eq!(envelope.artifact_length, 11);
        assert_eq!(
            envelope.artifact_sha256,
            hex::encode(Sha256::digest(b"renderer-v1"))
        );

        fs::write(&artifact, b"renderer-v2").unwrap();
        sign(&runtime, &artifact, &private_pem).unwrap();
        let second = fs::read_to_string(directory.path().join("renderer.sig")).unwrap();
        assert_ne!(first, second);
    }

    #[test]
    fn sign_rejects_empty_keys_and_non_files() {
        let directory = tempdir().unwrap();
        let runtime = runtime(directory.path());
        let error = sign(&runtime, directory.path(), " ").unwrap_err();
        assert!(error.contains("empty private key"));

        keygen(&runtime).unwrap();
        let private_pem = fs::read_to_string(directory.path().join("priv.pem")).unwrap();
        let error = sign(&runtime, directory.path(), &private_pem).unwrap_err();
        assert!(error.contains("not a regular file"));
    }
}
