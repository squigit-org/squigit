# Security Policy

## Supported Versions

This project provides security updates for the **latest release** only. We recommend always using the most recent version.

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you believe you have found a security issue, email [a7mddra@gmail.com](mailto:a7mddra@gmail.com). Include the affected product and version, reproduction steps, impact, and any suggested mitigation. Do not include credentials or unrelated personal data.

We aim to acknowledge a report within 48 hours and will work with the reporter on validation, remediation, and coordinated disclosure.

We appreciate your efforts to disclose your findings responsibly and will make every effort to acknowledge your contributions.

---

## Security Model & Practices

### For Developers

Squigit is built with security in mind from the ground up:

- **Production CLI credentials:** A normal CLI build requires the ignored `squigit-cli/secrets/credentials.json` file. Its build script embeds the OAuth application configuration into the executable and rejects missing or placeholder credentials.
- **Contributor mode:** `cargo xtask dev --demo` builds without production OAuth credentials. It disables authentication and accepts optional process-only Gemini and ImgBB keys from the environment or ignored `.env`.
- **Authentication:** Product hosts inject Google OAuth application credentials through `squigit-rs`. The shared auth crate implements the OAuth 2.0 Desktop application flow with PKCE and a loopback callback.
- **Secret handling:** Credentials, `.env`, demo state, build output, and generated release payloads are ignored and excluded from repository formatting and publication inputs.

### For End Users

Your privacy and data security are paramount. The application operates on a strict **local-first, zero-trust principle**:

- **No Squigit data service:** Squigit has no backend database or central application server. Profiles, settings, conversation history, OCR annotations, and attachment metadata are stored locally. Cloud features send only their required data directly to their provider.
- **Bring Your Own Key (BYOK)**: API keys are stored in a strict local AES-256-GCM envelope whose random master key lives in the operating-system vault. Stealing the encrypted file and CAS manifests alone does not reveal keys or provide an offline guessing oracle.
- **Secure Authentication**: The Google sign-in process happens entirely in your default web browser. The application itself never handles your password or email credentials.
- **End-to-End AI Chat**: Your conversations with AI providers are direct. Messages flow `you → provider → you`. We do not intercept, log, or have access to your prompts or completions.

This filesystem-theft guarantee does not protect against same-user malware, a compromised OS session or vault, process-memory inspection, input capture, malicious UI automation, or a compromised provider account.

### Important Notes on Image Handling (Google Lens Feature)

To enable the Google Lens integration, the selected screenshot must be accessible via a public URL. This process uses the ImgBB API.

- **Be Aware**: This means your image will be temporarily hosted on ImgBB's servers with a public link.
- **Recommendation**: If you do not trust ImgBB or are working with highly sensitive images, we advise **not using the built-in Google Lens feature**. Instead, you can manually visit [lens.google.com](https://lens.google.com) and upload your image directly.

---

## Platform-specific security notes

- **macOS:** Gatekeeper can warn about or block an unsigned or unnotarized binary. Follow the instructions attached to the specific distribution release rather than bypassing a warning from an unknown source.
- **Windows:** SmartScreen can warn about an unsigned or low-reputation executable. Verify the publisher, release source, and checksum before continuing.
- **Linux:** Prefer the published APT, DNF, or Homebrew package where available. For a standalone executable, verify the release source and checksum before granting execute permission.

Packaging and signing state can differ between the desktop, CLI, and native OCR products. The [distribution repository](https://github.com/squigit-org/distribution) owns release artifacts and package-manager metadata.
