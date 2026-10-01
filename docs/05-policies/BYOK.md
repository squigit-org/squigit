# Bring Your Own Key (BYOK)

Squigit is a local-first BYOK application with desktop and terminal interfaces. You supply credentials for OpenRouter and, optionally, ImgBB. Squigit does not proxy provider requests, resell access, or send credentials to Squigit-operated servers.

## What Handles Plaintext

Persisted API keys are plaintext only while you enter or explicitly reveal them and inside the native process while Squigit constructs an authorized provider request. The selected provider necessarily receives the key. Squigit-operated servers do not.

In the desktop shell, normal renderer state and IPC flows carry configured status, credential width, profile IDs, and provider names. Reveal is a separate, user-authorized capability whose temporary renderer value is cleared after 30 seconds, on hide, blur, settings close, profile change, window blur, or document visibility loss.

Contributor CLI demo mode is a separate process-only path. It can read `OPENROUTER_API_KEY` and `IMGBB_API_KEY` from the environment or ignored `.env`, holds them in zeroizing memory, and never writes them to `keys.json` or the OS vault.

## Storage

`keys.json` is a strict schema-2 encrypted store. Each save uses a fresh 32-byte HKDF salt and 12-byte AES-GCM nonce. A record key is derived with HKDF-SHA256 from a random 32-byte encryption master held by the operating-system vault. Profile, provider, cipher, and KDF metadata are authenticated as AES-GCM associated data.

The vault service `org.squigit.byok` stores `record-encryption-master-v1`, which encrypts API-key records. It is deleted when the final credential is explicitly deleted.

The vault maps to macOS Keychain, Windows Credential Manager, and Linux Secret Service. Vault failure is closed: there is no filesystem, environment-variable, Electron `basic-text`, or plaintext fallback.

Existing older key files and unversioned object manifests are not migrated or accepted.

## Local Images

Image renditions and briefs are stored in local CAS. Manifests contain local image metadata and optional ImgBB/Lens cache data, with no AI cloud handles, expiry values, or credential-derived remote identifiers. Adding an attachment makes no provider request. Conversations and brief jobs send inline pixels when needed. Recall loads the saved image rendition again.

## Provider Transport

OpenRouter credentials are sent in the sensitive `Authorization: Bearer` request header. Keys are locally checked and validated through `/api/v1/key` before saving. A valid key does not imply available paid credits. ImgBB requires its credential in a query parameter, so Squigit strips credential-bearing URLs from errors and logs.

Prompts, attached images, and generated content travel between your device, OpenRouter, and its selected AI providers. The Google Lens feature uploads its selected image to ImgBB to obtain a public URL; do not use that feature with sensitive images.

## Security Boundary

Stealing only `keys.json` and CAS manifests does not reveal credentials and does not provide an offline credential-guessing oracle. Local file metadata and provider configuration remain visible.

This guarantee does not cover same-user malware, a compromised OS session or vault, process-memory inspection, input capture, malicious accessibility/UI automation, or a compromised provider account. Revoke affected credentials at the provider if the device or account is compromised.

## Supported Providers

| Provider   | Purpose                                            | Credential setup                                  |
| ---------- | -------------------------------------------------- | ------------------------------------------------- |
| OpenRouter | Text/image conversations, titles, and image briefs | [OpenRouter](https://openrouter.ai/settings/keys) |
| ImgBB      | Optional image hosting for reverse image search    | [ImgBB API](https://api.imgbb.com/)               |

API error diagnostics stay in memory and appear under `[Squigit OpenRouter]` in desktop DevTools. No API disk logs are created. Credentials are redacted.
