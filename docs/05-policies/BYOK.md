# Bring Your Own Key (BYOK)

Squigit is a local-first BYOK application with desktop and terminal interfaces. You supply credentials for Google AI Studio and, optionally, ImgBB. Squigit does not proxy provider requests, resell access, or send credentials to Squigit-operated servers.

## What Handles Plaintext

Persisted API keys are plaintext only while you enter or explicitly reveal them and inside the native process while Squigit constructs an authorized provider request. The selected provider necessarily receives the key. Squigit-operated servers do not.

In the desktop shell, normal renderer state and IPC flows carry configured status, credential width, profile IDs, and provider names. Reveal is a separate, user-authorized capability whose temporary renderer value is cleared after 30 seconds, on hide, blur, settings close, profile change, window blur, or document visibility loss.

Contributor CLI demo mode is a separate process-only path. It can read `GEMINI_API_KEY` and `IMGBB_API_KEY` from the environment or ignored `.env`, holds them in zeroizing memory, and never writes them to `keys.json` or the OS vault.

## Storage

`keys.json` is a strict schema-1 encrypted store. Each save uses a fresh 32-byte HKDF salt and 12-byte AES-GCM nonce. A record key is derived with HKDF-SHA256 from a random 32-byte encryption master held by the operating-system vault. Profile, provider, cipher, and KDF metadata are authenticated as AES-GCM associated data.

Two independent secrets are stored under vault service `org.squigit.byok`:

- `record-encryption-master-v1` encrypts API-key records. It is deleted when the final credential is explicitly deleted.
- `cas-binding-key-v1` derives stable, credential-bound CAS remote identities. It survives credential deletion and encryption-master replacement so switching A → B → A can reuse A's unexpired upload.

The vault maps to macOS Keychain, Windows Credential Manager, and Linux Secret Service. Vault failure is closed: there is no filesystem, environment-variable, Electron `basic-text`, or plaintext fallback.

Existing older key files and unversioned object manifests are not migrated or accepted.

## Credential-Bound Attachments

Gemini Files resources are credential-sensitive. For each object and API key, Squigit stores a bare 64-character lowercase hexadecimal identifier:

```text
HMAC-SHA256(
  cas-binding-key-v1,
  frame("squigit/cas/v1/object-remote", provider, object-hash, canonical-api-key)
)
```

The secret HMAC key prevents an attacker who steals `keys.json` and CAS manifests from checking API-key guesses offline. Including the object hash prevents the persisted identifiers from correlating one credential across different objects.

Each manifest retains multiple unexpired remotes. Key switching inserts or selects one map entry; it never removes another key's entry. Expired, inactive, 404, and 410 entries are replaced individually. Authentication and transient network failures do not create duplicate uploads.

## Provider Transport

Gemini credentials are sent in the sensitive `x-goog-api-key` request header. ImgBB requires its credential in a query parameter, so Squigit strips credential-bearing URLs from errors and logs.

Prompts, attachments, and generated content go directly from your device to the provider you selected. The Google Lens feature uploads its selected image to ImgBB to obtain a public URL; do not use that feature with sensitive images.

## Security Boundary

Stealing only `keys.json` and CAS manifests does not reveal credentials and does not provide an offline credential-guessing oracle. File metadata, provider configuration, and Gemini resource names remain visible.

This guarantee does not cover same-user malware, a compromised OS session or vault, process-memory inspection, input capture, malicious accessibility/UI automation, or a compromised provider account. Revoke affected credentials at the provider if the device or account is compromised.

## Supported Providers

| Provider         | Purpose                                         | Credential setup                                           |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Google AI Studio | Gemini models and Files API                     | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| ImgBB            | Optional image hosting for reverse image search | [ImgBB API](https://api.imgbb.com/)                        |
