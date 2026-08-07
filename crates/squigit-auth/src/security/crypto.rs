// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use squigit_storage::{EncryptedKeyRecord, ProfileStore, RecordCipher, RecordKdf};
use zeroize::{Zeroize, Zeroizing};

use crate::{ByokErrorCode, ProfileError, Result};

use super::{
    validate_api_key, ApiKeyProvider, OsSecretVault, SecretVault, VaultKey,
    CAS_BINDING_KEY_ACCOUNT, RECORD_ENCRYPTION_MASTER_ACCOUNT,
};

const RECORD_KEY_DOMAIN: &str = "squigit/byok/v1/record-key";
const RECORD_AAD_DOMAIN: &str = "squigit/byok/v1/record-aad";
const RUNTIME_CREDENTIAL_DOMAIN: &str = "squigit/cas/v1/runtime-credential";
const OBJECT_REMOTE_DOMAIN: &str = "squigit/cas/v1/object-remote";
const AES_256_GCM: &str = "aes-256-gcm";
const HKDF_SHA256: &str = "hkdf-sha256";

type HmacSha256 = Hmac<Sha256>;

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
    #[doc(hidden)]
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(Zeroizing::new(bytes))
    }

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

pub fn frame(fields: &[&str]) -> Vec<u8> {
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
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&record_key[..]));
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce_bytes),
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
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&record_key[..]));
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
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

fn hmac_digest(key: &VaultKey, fields: &[&str]) -> CredentialDigest {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key.expose())
        .expect("HMAC-SHA256 accepts a 32-byte key");
    mac.update(&frame(fields));
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&mac.finalize().into_bytes());
    CredentialDigest(Zeroizing::new(digest))
}

fn runtime_digest(
    binding_key: &VaultKey,
    provider: ApiKeyProvider,
    api_key: &SecretString,
) -> CredentialDigest {
    hmac_digest(
        binding_key,
        &[
            RUNTIME_CREDENTIAL_DOMAIN,
            provider.storage_key_name(),
            api_key.expose(),
        ],
    )
}

pub fn object_remote_id(
    provider: ApiKeyProvider,
    lowercase_object_hash: &str,
    api_key: &SecretString,
) -> Result<String> {
    if lowercase_object_hash.len() != 64
        || !lowercase_object_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ProfileError::byok(
            ByokErrorCode::MalformedKeyStore,
            "The CAS object hash is not canonical lowercase hexadecimal.",
        ));
    }
    let vault = OsSecretVault;
    let binding_key = required_vault_key(
        &vault,
        CAS_BINDING_KEY_ACCOUNT,
        ByokErrorCode::CasBindingKeyMissing,
    )?;
    let digest = hmac_digest(
        &binding_key,
        &[
            OBJECT_REMOTE_DOMAIN,
            provider.storage_key_name(),
            lowercase_object_hash,
            api_key.expose(),
        ],
    );
    Ok(hex::encode(&digest.0[..]))
}

pub fn get_decrypted_api_key(
    store: &ProfileStore,
    provider: ApiKeyProvider,
    profile_id: &str,
) -> Result<Option<DecryptedApiKey>> {
    get_decrypted_api_key_with_vault(store, provider, profile_id, &OsSecretVault)
}

pub fn get_decrypted_api_key_with_vault<V: SecretVault>(
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
    let binding_key = required_vault_key(
        vault,
        CAS_BINDING_KEY_ACCOUNT,
        ByokErrorCode::CasBindingKeyMissing,
    )?;
    let api_key = decrypt_record(&master, profile_id, provider, &record)?;
    let runtime_digest = runtime_digest(&binding_key, provider, &api_key);
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

pub fn encrypt_and_save_api_key_with_vault<V: SecretVault>(
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

    store.with_key_store_transaction(|transaction| {
        let mut keys = transaction.load()?;
        let store_was_empty = keys.profiles.is_empty();
        let mut created_master = false;
        let mut created_binding = false;

        let result = (|| {
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

            let _binding_key = match vault.get(CAS_BINDING_KEY_ACCOUNT)? {
                Some(key) => key,
                None => {
                    if squigit_storage::ThreadStorage::with_config_root(store.base_dir().clone())?
                        .has_object_remotes()?
                    {
                        return Err(ProfileError::byok(
                            ByokErrorCode::CasBindingKeyMissing,
                            "CAS remotes exist but their OS-vault binding key is missing. Reset remote metadata explicitly before creating a replacement.",
                        ));
                    }
                    created_binding = true;
                    create_and_verify_vault_key(vault, CAS_BINDING_KEY_ACCOUNT)?
                }
            };

            let record = encrypt_record(&master, profile_id, provider, &plaintext)?;
            keys.profiles
                .entry(profile_id.to_owned())
                .or_default()
                .insert(provider.storage_key_name(), record)
                .map_err(|message| {
                    ProfileError::byok(ByokErrorCode::MalformedKeyStore, message)
                })?;
            transaction.save(&keys)?;
            Ok(())
        })();

        if result.is_err() {
            if created_binding {
                let _ = vault.delete(CAS_BINDING_KEY_ACCOUNT);
            }
            if created_master {
                let _ = vault.delete(RECORD_ENCRYPTION_MASTER_ACCOUNT);
            }
        }
        result
    })
}

pub fn reset_remote_cache_security() -> Result<usize> {
    let storage = squigit_storage::ThreadStorage::new()?;
    let reset = storage.reset_all_object_remotes()?;
    let vault = OsSecretVault;
    vault.delete(CAS_BINDING_KEY_ACCOUNT)?;
    let _replacement = create_and_verify_vault_key(&vault, CAS_BINDING_KEY_ACCOUNT)?;
    Ok(reset)
}

pub fn delete_api_key(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
) -> Result<bool> {
    delete_api_key_with_vault(store, profile_id, provider, &OsSecretVault)
}

pub fn delete_api_key_with_vault<V: SecretVault>(
    store: &ProfileStore,
    profile_id: &str,
    provider: ApiKeyProvider,
    vault: &V,
) -> Result<bool> {
    store.with_key_store_transaction(|transaction| {
        let previous = transaction.load()?;
        let mut keys = previous.clone();
        let mut changed = false;
        let mut remove_profile = false;
        if let Some(profile_keys) = keys.profiles.get_mut(profile_id) {
            changed = profile_keys.remove(provider.storage_key_name()).is_some();
            remove_profile = profile_keys.is_empty();
        }
        if remove_profile {
            keys.profiles.remove(profile_id);
        }
        if !changed {
            return Ok(false);
        }

        transaction.save(&keys)?;
        if keys.profiles.is_empty() {
            if let Err(error) = vault.delete(RECORD_ENCRYPTION_MASTER_ACCOUNT) {
                transaction.save(&previous)?;
                return Err(error);
            }
        }
        Ok(true)
    })
}
