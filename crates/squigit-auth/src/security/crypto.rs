// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use squigit_storage::{EncryptedKeyRecord, ProfileStore, RecordCipher, RecordKdf};
use std::sync::{OnceLock, RwLock};
use zeroize::{Zeroize, Zeroizing};

use crate::{ByokErrorCode, ProfileError, Result};

use super::vault::{OsSecretVault, SecretVault, VaultKey, RECORD_ENCRYPTION_MASTER_ACCOUNT};
use super::{validate_api_key, ApiKeyProvider};

const RECORD_KEY_DOMAIN: &str = "squigit/byok/v1/record-key";
const RECORD_AAD_DOMAIN: &str = "squigit/byok/v1/record-aad";
const SESSION_CREDENTIAL_DOMAIN: &str = "squigit/session/v1/runtime-credential";
const AES_256_GCM: &str = "aes-256-gcm";
const HKDF_SHA256: &str = "hkdf-sha256";

type HmacSha256 = Hmac<Sha256>;

#[derive(Default)]
struct SessionApiKeys {
    active: bool,
    open_router: Option<SecretString>,
    imgbb: Option<SecretString>,
}

impl SessionApiKeys {
    fn get(&self, provider: ApiKeyProvider) -> Option<&SecretString> {
        match provider {
            ApiKeyProvider::OpenRouter => self.open_router.as_ref(),
            ApiKeyProvider::ImgBb => self.imgbb.as_ref(),
        }
    }
}

static SESSION_API_KEYS: OnceLock<RwLock<SessionApiKeys>> = OnceLock::new();

fn session_api_keys() -> &'static RwLock<SessionApiKeys> {
    SESSION_API_KEYS.get_or_init(|| RwLock::new(SessionApiKeys::default()))
}

pub struct SecretString(Zeroizing<String>);

impl std::fmt::Debug for SecretString {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SecretString([REDACTED])")
    }
}

impl SecretString {
    pub fn new(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub fn expose(&self) -> &str {
        self.0.as_str()
    }

    pub fn into_inner(mut self) -> String {
        std::mem::take(&mut *self.0)
    }
}

pub struct CredentialDigest(Zeroizing<[u8; 32]>);

impl std::fmt::Debug for CredentialDigest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("CredentialDigest([REDACTED])")
    }
}

impl CredentialDigest {
    pub fn matches(&self, other: &Self) -> bool {
        let Ok(mut mac) = <HmacSha256 as Mac>::new_from_slice(&self.0[..]) else {
            return false;
        };
        mac.update(b"credential-digest-comparison");
        mac.verify_slice(
            &<HmacSha256 as Mac>::new_from_slice(&other.0[..])
                .expect("HMAC-SHA256 accepts a 32-byte key")
                .chain_update(b"credential-digest-comparison")
                .finalize()
                .into_bytes(),
        )
        .is_ok()
    }
}

pub struct DecryptedApiKey {
    pub api_key: SecretString,
    pub runtime_digest: CredentialDigest,
}

impl std::fmt::Debug for DecryptedApiKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("DecryptedApiKey")
            .field("api_key", &"[REDACTED]")
            .field("runtime_digest", &"[REDACTED]")
            .finish()
    }
}

fn frame(fields: &[&str]) -> Vec<u8> {
    let capacity = fields
        .iter()
        .map(|field| std::mem::size_of::<u32>() + field.len())
        .sum();
    let mut framed = Vec::with_capacity(capacity);
    for field in fields {
        let bytes = field.as_bytes();
        let length = u32::try_from(bytes.len()).expect("BYOK frame field exceeds u32");
        framed.extend_from_slice(&length.to_be_bytes());
        framed.extend_from_slice(bytes);
    }
    framed
}

fn canonicalize_api_key(provider: ApiKeyProvider, plaintext: &str) -> Result<SecretString> {
    let canonical = plaintext.trim();
    if canonical.is_empty() {
        return Err(ProfileError::byok(
            ByokErrorCode::InvalidCredential,
            "An empty API key cannot be saved. Use explicit deletion instead.",
        ));
    }
    validate_api_key(provider, canonical)?;
    Ok(SecretString::new(canonical.to_owned()))
}

/// Replace the process-only API keys used by developer shells.
///
/// These credentials are validated and zeroized in memory. They are never
/// written to the profile key store or the operating-system vault.
pub fn set_session_api_keys(open_router: Option<&str>, imgbb: Option<&str>) -> Result<()> {
    let open_router = open_router
        .map(|value| canonicalize_api_key(ApiKeyProvider::OpenRouter, value))
        .transpose()?;
    let imgbb = imgbb
        .map(|value| canonicalize_api_key(ApiKeyProvider::ImgBb, value))
        .transpose()?;
    let mut keys = session_api_keys()
        .write()
        .map_err(|_| ProfileError::Auth("Process-only API-key state is unavailable.".into()))?;
    *keys = SessionApiKeys {
        active: true,
        open_router,
        imgbb,
    };
    Ok(())
}

/// Return whether process-only credentials replace the persistent key store.
pub fn session_api_keys_active() -> bool {
    session_api_keys().read().is_ok_and(|keys| keys.active)
}

/// Return the character width of a process-only credential, when configured.
pub fn session_api_key_width(provider: ApiKeyProvider) -> Option<u32> {
    session_api_keys().read().ok().and_then(|keys| {
        keys.get(provider)
            .map(|key| key.expose().chars().count() as u32)
    })
}

fn session_api_key(provider: ApiKeyProvider) -> Option<SecretString> {
    session_api_keys().read().ok().and_then(|keys| {
        keys.get(provider)
            .map(|key| SecretString::new(key.expose().to_owned()))
    })
}

fn random_vault_key() -> [u8; 32] {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

fn create_and_verify_vault_key<V: SecretVault>(vault: &V, account: &str) -> Result<VaultKey> {
    let mut generated = Zeroizing::new(random_vault_key());
    vault.set(account, &generated)?;
    let read_back = match vault.get(account) {
        Ok(Some(secret)) => secret,
        Ok(None) => {
            let _ = vault.delete(account);
            return Err(ProfileError::byok(
                ByokErrorCode::VaultUnavailable,
                "The OS vault did not return the secret it just stored.",
            ));
        }
        Err(error) => {
            let _ = vault.delete(account);
            return Err(error);
        }
    };
    if generated.as_ref() != read_back.expose() {
        let _ = vault.delete(account);
        return Err(ProfileError::byok(
            ByokErrorCode::VaultUnavailable,
            "The OS vault did not preserve the stored secret.",
        ));
    }
    generated.zeroize();
    Ok(read_back)
}

fn required_vault_key<V: SecretVault>(
    vault: &V,
    account: &str,
    missing_code: ByokErrorCode,
) -> Result<VaultKey> {
    vault.get(account)?.ok_or_else(|| {
        ProfileError::byok(
            missing_code,
            format!("Required OS-vault entry '{account}' is missing."),
        )
    })
}

fn derive_record_key(
    master: &VaultKey,
    salt: &[u8],
    profile_id: &str,
    provider: ApiKeyProvider,
) -> Result<Zeroizing<[u8; 32]>> {
    let info = frame(&[RECORD_KEY_DOMAIN, profile_id, provider.storage_key_name()]);
    let hkdf = Hkdf::<Sha256>::new(Some(salt), master.expose());
    let mut key = Zeroizing::new([0u8; 32]);
    hkdf.expand(&info, &mut *key).map_err(|_| {
        ProfileError::byok(
            ByokErrorCode::EncryptionFailed,
            "Failed to derive an API-key record encryption key.",
        )
    })?;
    Ok(key)
}

fn record_aad(profile_id: &str, provider: ApiKeyProvider) -> Vec<u8> {
    frame(&[
        RECORD_AAD_DOMAIN,
        profile_id,
        provider.storage_key_name(),
        AES_256_GCM,
        HKDF_SHA256,
    ])
}

fn encrypt_record(
    master: &VaultKey,
    profile_id: &str,
    provider: ApiKeyProvider,
    plaintext: &SecretString,
) -> Result<EncryptedKeyRecord> {
    let mut salt = [0u8; 32];
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce_bytes);

    let record_key = derive_record_key(master, &salt, profile_id, provider)?;
    let cipher =
        Aes256Gcm::new_from_slice(&record_key[..]).expect("HKDF-SHA256 produces an AES-256 key");
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext.expose().as_bytes(),
                aad: &record_aad(profile_id, provider),
            },
        )
        .map_err(|_| {
            ProfileError::byok(
                ByokErrorCode::EncryptionFailed,
                "Failed to encrypt the API-key record.",
            )
        })?;

    Ok(EncryptedKeyRecord {
        cipher: RecordCipher::Aes256Gcm,
        width: plaintext.expose().chars().count() as u32,
        kdf: RecordKdf::HkdfSha256,
        salt: URL_SAFE_NO_PAD.encode(salt),
        nonce: URL_SAFE_NO_PAD.encode(nonce_bytes),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
    })
}

fn decode_record_field(encoded: &str, expected_length: Option<usize>) -> Result<Vec<u8>> {
    let decoded = URL_SAFE_NO_PAD.decode(encoded).map_err(|_| {
        ProfileError::byok(
            ByokErrorCode::MalformedKeyStore,
            "The encrypted API-key store contains invalid base64url.",
        )
    })?;
    if expected_length.is_some_and(|length| decoded.len() != length)
        || URL_SAFE_NO_PAD.encode(&decoded) != encoded
    {
        return Err(ProfileError::byok(
            ByokErrorCode::MalformedKeyStore,
            "The encrypted API-key store contains non-canonical data.",
        ));
    }
    Ok(decoded)
}

fn decrypt_record(
    master: &VaultKey,
    profile_id: &str,
    provider: ApiKeyProvider,
    record: &EncryptedKeyRecord,
) -> Result<SecretString> {
    let salt = decode_record_field(&record.salt, Some(32))?;
    let nonce = decode_record_field(&record.nonce, Some(12))?;
    let mut ciphertext = decode_record_field(&record.ciphertext, None)?;
    if ciphertext.len() < 16 {
        ciphertext.zeroize();
        return Err(ProfileError::byok(
            ByokErrorCode::MalformedKeyStore,
            "The encrypted API-key record does not contain an authentication tag.",
        ));
    }

    let record_key = derive_record_key(master, &salt, profile_id, provider)?;
    let cipher =
        Aes256Gcm::new_from_slice(&record_key[..]).expect("HKDF-SHA256 produces an AES-256 key");
    let nonce = Nonce::from(
        <[u8; 12]>::try_from(nonce.as_slice())
            .expect("encrypted record nonces are validated as 12 bytes"),
    );
    let plaintext = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: &ciphertext,
                aad: &record_aad(profile_id, provider),
            },
        )
        .map_err(|_| {
            ProfileError::byok(
                ByokErrorCode::MalformedKeyStore,
                "The encrypted API-key record failed authentication.",
            )
        })?;
    ciphertext.zeroize();
    let plaintext = String::from_utf8(plaintext).map_err(|error| {
        let mut bytes = error.into_bytes();
        bytes.zeroize();
        ProfileError::byok(
            ByokErrorCode::MalformedKeyStore,
            "The decrypted API-key record is not valid UTF-8.",
        )
    })?;
    let secret = SecretString::new(plaintext);
    validate_api_key(provider, secret.expose()).map_err(|_| {
        ProfileError::byok(
            ByokErrorCode::MalformedKeyStore,
            "The decrypted API-key record has an invalid provider format.",
        )
    })?;
    Ok(secret)
}

fn session_runtime_digest(provider: ApiKeyProvider, api_key: &SecretString) -> CredentialDigest {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(SESSION_CREDENTIAL_DOMAIN.as_bytes())
        .expect("HMAC-SHA256 accepts the session credential domain");
    mac.update(&frame(&[provider.storage_key_name(), api_key.expose()]));
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&mac.finalize().into_bytes());
    CredentialDigest(Zeroizing::new(digest))
}

pub fn get_decrypted_api_key(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<Option<DecryptedApiKey>> {
    if session_api_keys_active() {
        return Ok(session_api_key(provider).map(|api_key| {
            let runtime_digest = session_runtime_digest(provider, &api_key);
            DecryptedApiKey {
                api_key,
                runtime_digest,
            }
        }));
    }
    get_decrypted_api_key_with_vault(store, provider, profile_id, &OsSecretVault)
}

fn get_decrypted_api_key_with_vault<V: SecretVault>(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
    vault: &V,
) -> Result<Option<DecryptedApiKey>> {
    let Some(record) = store.load_encrypted_key_record(profile_id, provider.storage_key_name())?
    else {
        return Ok(None);
    };
    let master = required_vault_key(
        vault,
        RECORD_ENCRYPTION_MASTER_ACCOUNT,
        ByokErrorCode::MasterKeyMissing,
    )?;
    let api_key = decrypt_record(&master, profile_id, provider, &record)?;
    let runtime_digest = session_runtime_digest(provider, &api_key);
    Ok(Some(DecryptedApiKey {
        api_key,
        runtime_digest,
    }))
}

pub fn reveal_api_key(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<Option<SecretString>> {
    let secret =
        get_decrypted_api_key(store, provider, profile_id)?.map(|credential| credential.api_key);
    Ok(secret)
}

pub fn get_api_key_status(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<bool> {
    if session_api_keys_active() {
        return Ok(session_api_key_width(provider).is_some());
    }
    Ok(store
        .load_encrypted_key_record(profile_id, provider.storage_key_name())?
        .is_some())
}

pub fn encrypt_and_save_api_key(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
    plaintext: &str,
) -> Result<()> {
    encrypt_and_save_api_key_with_vault(store, profile_id, provider, plaintext, &OsSecretVault)
}

fn encrypt_and_save_api_key_with_vault<V: SecretVault>(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
    plaintext: &str,
    vault: &V,
) -> Result<()> {
    if store.get_profile(profile_id)?.is_none() {
        return Err(ProfileError::ProfileNotFound(profile_id.to_owned()));
    }
    let plaintext = canonicalize_api_key(provider, plaintext)?;

    let mut created_master = false;
    let result = store.with_key_store_transaction(|transaction| {
        let store_was_empty = transaction.is_empty()?;
        let master = match vault.get(RECORD_ENCRYPTION_MASTER_ACCOUNT)? {
            Some(key) => key,
            None if store_was_empty => {
                created_master = true;
                create_and_verify_vault_key(vault, RECORD_ENCRYPTION_MASTER_ACCOUNT)?
            }
            None => {
                return Err(ProfileError::byok(
                    ByokErrorCode::MasterKeyMissing,
                    "A populated key store is missing its OS-vault encryption master.",
                ));
            }
        };
        let record = encrypt_record(&master, profile_id, provider, &plaintext)?;
        transaction.set(profile_id, provider.storage_key_name(), &record)?;
        Ok(())
    });
    if result.is_err() && created_master {
        let _ = store.with_key_store_transaction::<_, ProfileError>(|transaction| {
            if transaction.is_empty()? {
                vault.delete(RECORD_ENCRYPTION_MASTER_ACCOUNT)?;
            }
            Ok(())
        });
    }
    result
}

pub fn delete_api_key(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
) -> Result<bool> {
    delete_api_key_with_vault(store, profile_id, provider, &OsSecretVault)
}

fn delete_api_key_with_vault<V: SecretVault>(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
    vault: &V,
) -> Result<bool> {
    let mut deleted_master = None;
    let result = store.with_key_store_transaction(|transaction| {
        if !transaction.delete(profile_id, provider.storage_key_name())? {
            return Ok(false);
        }
        if transaction.is_empty()? {
            deleted_master = vault.get(RECORD_ENCRYPTION_MASTER_ACCOUNT)?;
            vault.delete(RECORD_ENCRYPTION_MASTER_ACCOUNT)?;
        }
        Ok(true)
    });
    if result.is_err() {
        if let Some(master) = deleted_master {
            store.with_key_store_transaction::<_, ProfileError>(|transaction| {
                if !transaction.is_empty()?
                    && vault.get(RECORD_ENCRYPTION_MASTER_ACCOUNT)?.is_none()
                {
                    vault.set(RECORD_ENCRYPTION_MASTER_ACCOUNT, master.expose())?;
                }
                Ok(())
            })?;
        }
    }
    result
}
