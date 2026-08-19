# Cryptography Foundation

Status: **BYOK schema 1 implemented; OTA signing remains independently versioned**

This document defines Squigit's cryptographic ownership, formats, failure rules, and threat boundaries.

## BYOK Key Inventory

Rust owns BYOK cryptography and provider credential use. Under OS-vault service `org.squigit.byok`, it stores two independent random 32-byte secrets:

| Vault account | Purpose | Lifetime |
| --- | --- | --- |
| `record-encryption-master-v1` | Derive per-record AES keys | Deleted after explicit deletion of the final credential |
| `cas-binding-key-v1` | Derive runtime credential digests and per-object remote IDs | Retained across credential changes and encryption-master replacement |

Both values come from the operating-system CSPRNG. The vault maps to macOS Keychain, Windows Credential Manager, and Linux Secret Service. A locked, denied, unavailable, or missing vault fails closed. No predictable metadata, filesystem file, environment variable, renderer storage, or plaintext fallback replaces either secret.

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

`keys.json` stores canonical unpadded base64url for the salt, nonce, and combined ciphertext-plus-tag. Strict types reject unknown fields, unknown algorithms, noncanonical encodings, incorrect decoded lengths, and any schema other than 3. Moving a record to another profile or provider, or changing authenticated metadata, causes decryption failure.

A populated store with a missing encryption master never receives a replacement. On the first save, newly created vault values are read back before the file is written. Any failure before the durable file transaction completes triggers deletion of only the vault values created by that transaction.

Saving an empty credential is invalid. Deletion is explicit. Deleting the final credential durably writes the empty schema-3 store before deleting `record-encryption-master-v1`; if vault deletion fails, the encrypted file is restored. `cas-binding-key-v1` remains.

## CAS Binding

Runtime comparison uses:

```text
HMAC-SHA256(
  cas-binding-key-v1,
  frame(
    "squigit/cas/v1/runtime-credential",
    provider,
    canonical-api-key
  )
)
```

The persisted object-remote ID uses:

```text
lowercase-hex(
  HMAC-SHA256(
    cas-binding-key-v1,
    frame(
      "squigit/cas/v1/object-remote",
      provider,
      lowercase-object-hash,
      canonical-api-key
    )
  )
)
```

The persisted ID is exactly 64 lowercase hexadecimal characters with no prefix. It contains no profile, revision, timestamp, nonce, ciphertext, save-time value, or plaintext-derived unkeyed fingerprint.

This makes identity stable for A → B → A while preventing an attacker with only filesystem data from verifying API-key guesses. Different objects receive different persisted IDs for the same credential.

Loss of `cas-binding-key-v1` makes existing bindings unrecoverable. Squigit will not silently replace it while manifests contain remotes. An explicit remote-cache security reset clears remote metadata before generating a replacement.

## Filesystem and Memory Rules

- `keys.json` mutations use an in-process mutex and OS-backed `keys.lock`.
- Object-manifest mutations use an in-process object mutex and a per-object advisory `manifest.lock`.
- Security-sensitive directories are mode 0700 and key, manifest, and lock files are mode 0600 on Unix.
- Symlinks and nonregular metadata targets are rejected.
- Temporary files are created with final permissions, flushed, and durably replaced. Parent directories are synchronized on Unix; Windows replacement uses `MoveFileExW` with replace-existing and write-through flags.
- Secret wrappers zero memory on drop and redact `Debug`.
- Credentials, ciphertext, vault keys, credential digests, object-remote IDs, and credential-bearing URLs are excluded from production logs.

## Threat Boundary

Stealing `keys.json` and CAS manifests without the vault secrets cannot recover API keys or verify guesses. Configuration, file metadata, and provider resource names remain visible.

Same-user malware, compromised OS sessions, process-memory inspection, input capture, malicious accessibility/UI automation, and compromised provider accounts are outside this guarantee.

## Other Cryptography

Google OAuth uses PKCE and validates provider identity before creating a local profile. OTA artifacts use the separately documented Ed25519 verification key and release process; OTA keys are not reused for BYOK.
