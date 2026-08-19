// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose, Engine as _};
use ed25519_dalek::{pkcs8::DecodePublicKey, Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use crate::{ProfileError, Result};

const EMBEDDED_PUBLIC_KEY_PEM: &str = include_str!(env!("SQUIGIT_OTA_PUBLIC_KEY_EMBEDDED_FILE"));
const SIGNATURE_FORMAT: &str = "squigit.ota.signature.v1";
const SIGNATURE_ALGORITHM: &str = "ed25519";
const HASH_ALGORITHM: &str = "sha256";

#[derive(Debug, Deserialize)]
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

/// Verifies a detached Squigit OTA signature using the public key embedded at build time.
///
/// Returns `Ok(false)` when the signature or artifact is untrusted or malformed. File-system
/// failures and a missing or invalid build-time verification key are returned as errors.
pub fn verify_artifact_signature(
    artifact_path: impl AsRef<Path>,
    signature_path: impl AsRef<Path>,
) -> Result<bool> {
    verify_artifact_signature_with_key(
        artifact_path.as_ref(),
        signature_path.as_ref(),
        EMBEDDED_PUBLIC_KEY_PEM,
    )
}

fn verify_artifact_signature_with_key(
    artifact_path: &Path,
    signature_path: &Path,
    public_key_pem: &str,
) -> Result<bool> {
    let verifying_key = parse_trusted_public_key(public_key_pem)?;
    let encoded_envelope = fs::read(signature_path)?;
    let envelope: SignatureEnvelope = match serde_json::from_slice(&encoded_envelope) {
        Ok(envelope) => envelope,
        Err(_) => return Ok(false),
    };

    if envelope.format != SIGNATURE_FORMAT
        || envelope.algorithm != SIGNATURE_ALGORITHM
        || envelope.hash != HASH_ALGORITHM
        || envelope.key_id != key_id(&verifying_key.to_bytes())
        || !is_lower_hex_digest(&envelope.artifact_sha256)
    {
        return Ok(false);
    }

    let signature_bytes = match general_purpose::STANDARD.decode(&envelope.signature) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(false),
    };
    let signature = match Signature::from_slice(&signature_bytes) {
        Ok(signature) => signature,
        Err(_) => return Ok(false),
    };

    let (artifact_length, artifact_digest) = hash_artifact(artifact_path)?;
    if artifact_length != envelope.artifact_length
        || hex::encode(artifact_digest) != envelope.artifact_sha256
    {
        return Ok(false);
    }

    let canonical = canonical_payload(
        &envelope.key_id,
        envelope.artifact_length,
        &envelope.artifact_sha256,
    );
    Ok(verifying_key
        .verify_strict(canonical.as_bytes(), &signature)
        .is_ok())
}

fn parse_trusted_public_key(public_key_pem: &str) -> Result<VerifyingKey> {
    let trimmed = public_key_pem.trim();
    if trimmed.is_empty() || trimmed.to_ascii_lowercase().contains("replace") {
        return Err(ProfileError::MissingVerificationKey(
            "OTA verification is not configured in this build. Provide one of:\n- copy crates/squigit-auth/assets/crypto/pub.example.pem to crates/squigit-auth/assets/crypto/pub.pem and replace the placeholder\n- SQUIGIT_OTA_PUBLIC_KEY_PATH=<absolute path to pub.pem>\n- SQUIGIT_OTA_PUBLIC_KEY_PEM=<public key PEM>"
                .to_string(),
        ));
    }

    VerifyingKey::from_public_key_pem(trimmed).map_err(|error| {
        ProfileError::MissingVerificationKey(format!(
            "Configured OTA public key is not a valid Ed25519 public-key PEM: {error}"
        ))
    })
}

fn hash_artifact(path: &Path) -> Result<(u64, [u8; 32])> {
    let mut file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(ProfileError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("Artifact is not a regular file: {}", path.display()),
        )));
    }

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut length = 0u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        length = length.checked_add(read as u64).ok_or_else(|| {
            ProfileError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Artifact is too large: {}", path.display()),
            ))
        })?;
        hasher.update(&buffer[..read]);
    }
    Ok((length, hasher.finalize().into()))
}

fn key_id(public_key: &[u8; 32]) -> String {
    hex::encode(Sha256::digest(public_key))
}

fn is_lower_hex_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn canonical_payload(key_id: &str, artifact_length: u64, artifact_sha256: &str) -> String {
    format!(
        "format={SIGNATURE_FORMAT}\nalgorithm={SIGNATURE_ALGORITHM}\nhash={HASH_ALGORITHM}\nkey_id={key_id}\nartifact_length={artifact_length}\nartifact_sha256={artifact_sha256}\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::pkcs8::spki::der::pem::LineEnding;
    use ed25519_dalek::{pkcs8::EncodePublicKey, Signer, SigningKey};
    use rand::rngs::OsRng;
    use serde_json::json;
    use tempfile::tempdir;

    fn signed_fixture(
        contents: &[u8],
    ) -> (
        tempfile::TempDir,
        String,
        std::path::PathBuf,
        std::path::PathBuf,
    ) {
        let directory = tempdir().unwrap();
        let artifact = directory.path().join("artifact.zip");
        let signature_path = directory.path().join("artifact.sig");
        fs::write(&artifact, contents).unwrap();

        let signing_key = SigningKey::generate(&mut OsRng);
        let verifying_key = signing_key.verifying_key();
        let public_pem = verifying_key.to_public_key_pem(LineEnding::LF).unwrap();
        let artifact_sha256 = hex::encode(Sha256::digest(contents));
        let key_id = key_id(&verifying_key.to_bytes());
        let canonical = canonical_payload(&key_id, contents.len() as u64, &artifact_sha256);
        let signature = signing_key.sign(canonical.as_bytes());
        let envelope = json!({
            "format": SIGNATURE_FORMAT,
            "algorithm": SIGNATURE_ALGORITHM,
            "hash": HASH_ALGORITHM,
            "key_id": key_id,
            "artifact_length": contents.len() as u64,
            "artifact_sha256": artifact_sha256,
            "signature": general_purpose::STANDARD.encode(signature.to_bytes()),
        });
        fs::write(
            &signature_path,
            serde_json::to_vec_pretty(&envelope).unwrap(),
        )
        .unwrap();

        (directory, public_pem, artifact, signature_path)
    }

    #[test]
    fn verifies_a_valid_artifact() {
        let (_directory, public_pem, artifact, signature) = signed_fixture(b"renderer bundle");
        assert!(verify_artifact_signature_with_key(&artifact, &signature, &public_pem).unwrap());
    }

    #[test]
    fn rejects_artifact_tampering() {
        let (_directory, public_pem, artifact, signature) = signed_fixture(b"renderer bundle");
        fs::write(&artifact, b"tampered renderer bundle").unwrap();
        assert!(!verify_artifact_signature_with_key(&artifact, &signature, &public_pem).unwrap());
    }

    #[test]
    fn rejects_wrong_key_and_malformed_envelopes() {
        let (_directory, _public_pem, artifact, signature) = signed_fixture(b"renderer bundle");
        let other_key = SigningKey::generate(&mut OsRng)
            .verifying_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        assert!(!verify_artifact_signature_with_key(&artifact, &signature, &other_key).unwrap());

        fs::write(&signature, b"not json").unwrap();
        assert!(!verify_artifact_signature_with_key(&artifact, &signature, &other_key).unwrap());
    }

    #[test]
    fn rejects_tampered_or_unsupported_envelope_fields() {
        let (_directory, public_pem, artifact, signature) = signed_fixture(b"renderer bundle");
        let mut envelope: serde_json::Value =
            serde_json::from_slice(&fs::read(&signature).unwrap()).unwrap();
        envelope["algorithm"] = json!("rsa");
        fs::write(&signature, serde_json::to_vec(&envelope).unwrap()).unwrap();
        assert!(!verify_artifact_signature_with_key(&artifact, &signature, &public_pem).unwrap());
    }

    #[test]
    fn rejects_malformed_and_modified_signature_bytes() {
        let (_directory, public_pem, artifact, signature) = signed_fixture(b"renderer bundle");
        let mut envelope: serde_json::Value =
            serde_json::from_slice(&fs::read(&signature).unwrap()).unwrap();
        envelope["signature"] = json!("not-base64***");
        fs::write(&signature, serde_json::to_vec(&envelope).unwrap()).unwrap();
        assert!(!verify_artifact_signature_with_key(&artifact, &signature, &public_pem).unwrap());

        let mut signature_bytes = [0u8; 64];
        signature_bytes[0] = 1;
        envelope["signature"] = json!(general_purpose::STANDARD.encode(signature_bytes));
        fs::write(&signature, serde_json::to_vec(&envelope).unwrap()).unwrap();
        assert!(!verify_artifact_signature_with_key(&artifact, &signature, &public_pem).unwrap());
    }

    #[test]
    fn missing_or_invalid_public_key_is_a_configuration_error() {
        let directory = tempdir().unwrap();
        let artifact = directory.path().join("artifact.zip");
        let signature = directory.path().join("artifact.sig");
        fs::write(&artifact, b"artifact").unwrap();
        fs::write(&signature, b"{}").unwrap();

        assert!(matches!(
            verify_artifact_signature_with_key(&artifact, &signature, ""),
            Err(ProfileError::MissingVerificationKey(_))
        ));
        assert!(matches!(
            verify_artifact_signature_with_key(&artifact, &signature, "not a key"),
            Err(ProfileError::MissingVerificationKey(_))
        ));
    }

    #[test]
    fn missing_files_are_io_errors() {
        let directory = tempdir().unwrap();
        let signing_key = SigningKey::generate(&mut OsRng);
        let public_pem = signing_key
            .verifying_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        let missing = directory.path().join("missing");

        assert!(matches!(
            verify_artifact_signature_with_key(&missing, &missing, &public_pem),
            Err(ProfileError::Io(_))
        ));
    }
}
