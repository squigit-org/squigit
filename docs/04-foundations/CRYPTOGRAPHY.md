# Cryptography Foundation

Status: **BYOK schema 2 implemented**

This document defines Squigit's cryptographic ownership, formats, failure rules, and threat boundaries.

## BYOK Key Inventory

Rust owns BYOK cryptography and provider credential use. The OS-vault service `org.squigit.byok` stores one random 32-byte secret, `record-encryption-master-v1`, for deriving per-record AES keys. Explicit deletion of the final stored credential deletes this secret after the empty key store has been durably written.

The secret comes from the operating-system CSPRNG. The vault maps to macOS Keychain, Windows Credential Manager, and Linux Secret Service. A locked, denied, unavailable, or missing vault fails closed. No plaintext fallback replaces the encryption master.

## Framing

Every cryptographic input is unambiguous:

```text
frame(fields) =
  for each UTF-8 field:
    u32-big-endian byte length || field bytes
```

API-key input is trimmed once, preserves case and all remaining bytes, and is then validated for the selected provider.

## Record Encryption

For each save:

```text
salt  = OsRng(32 bytes)
nonce = OsRng(12 bytes)

info = frame(
  "squigit/byok/v1/record-key",
  profile-id,
  provider
)

aad = frame(
  "squigit/byok/v1/record-aad",
  profile-id,
  provider,
  "aes-256-gcm",
  "hkdf-sha256"
)

record-key = HKDF-SHA256(
  ikm  = record-encryption-master-v1,
  salt = salt,
  info = info
)

ciphertext = AES-256-GCM(
  key       = record-key,
  nonce     = nonce,
  plaintext = canonical-api-key,
  aad       = aad
)
```

`keys.json` stores the credential's character width and canonical unpadded base64url for the salt, nonce, and combined ciphertext-plus-tag. Encrypted records and provider maps reject unknown fields, unknown algorithms, noncanonical encodings, and incorrect decoded lengths. The root file rejects schemas other than 2. Moving a record to another profile or provider, or changing authenticated metadata, causes decryption failure.

A populated store with a missing encryption master never receives a replacement. On the first save, a newly created vault value are read back before the file is written. Any failure before the durable file transaction completes triggers deletion of only the vault value created by that transaction.

Saving an empty credential is invalid. Deletion is explicit. Deleting the final credential durably writes the empty schema-2 store before deleting `record-encryption-master-v1`; if vault deletion fails, the encrypted file is restored.

## Credential Pinning

Jobs retain the decrypted credential captured at submission. Changing the active profile or saved key does not change a running job's credential. Secret wrappers redact `Debug` and zero their memory on drop.

Credential comparisons use an in-memory HMAC digest with an explicitly framed provider and canonical API key. This digest is never serialized. Local CAS objects have no provider credentials, remote IDs, cloud URIs, or expiry fields.

## Contributor Session Keys

Contributor demo mode can use process-only OpenRouter and ImgBB keys. These values are validated, held in zeroizing memory, and never written to `keys.json` or the OS vault. Persistent credentials retain their encrypted storage format; the process-only mode supplies credentials directly to the same job pinning path.

## Filesystem and Memory Rules

- `keys.json` mutations use an in-process mutex and OS-backed `keys.lock`.
- Object-manifest mutations use an in-process object mutex and a per-object advisory `manifest.lock`.
- Security-sensitive directories are mode 0700 and key, manifest, and lock files are mode 0600 on Unix.
- Symlinks and nonregular metadata targets are rejected.
- Temporary files are created with final permissions, flushed, and durably replaced. Parent directories are synchronized on Unix; Windows replacement uses `MoveFileExW` with replace-existing and write-through flags.
- Secret wrappers zero memory on drop and redact `Debug`.
- Credentials, ciphertext, vault keys, credential digests, and credential-bearing URLs are excluded from production logs.

## Threat Boundary

Stealing `keys.json` and CAS manifests without the vault secrets cannot recover API keys or verify guesses. Configuration, file metadata, and local identifiers remain visible.

Same-user malware, compromised OS sessions, process-memory inspection, input capture, malicious accessibility/UI automation, and compromised provider accounts are outside this guarantee.

## Other Cryptography

Google OAuth uses PKCE and validates provider identity before creating a local profile.
