# Security Policy

## Supported Versions

This project provides security updates for the **latest release** only. We recommend always using the most recent version.

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you believe you have found a security issue, please report it responsibly:

- **Email**: [Your dedicated security contact email]
- **Expect a response** within 48 hours to acknowledge your report.
- **We will work with you** to understand, validate, and address the vulnerability. You can expect updates on the progress toward a fix and public disclosure.

We appreciate your efforts to disclose your findings responsibly and will make every effort to acknowledge your contributions.

---

## Security Model & Practices

### For Developers

Spatialshot is built with security in mind from the ground up:

- **No Hardcoded Secrets**: We use GitHub Secrets and CI-based credential injection. Attempting to build the application without the required `google-credentials.json` file will result in a build failure.
- **Authentication**: We implement the OAuth 2.0 Desktop application flow for authorization. For a successful build, we recommend either providing your own secrets or using the official repository's CI pipeline, which handles automatic injection.

### For End Users

Your privacy and data security are paramount. The application operates on a strict **local-first, zero-trust principle**:

- **No Data Collection**: Spatialshot has no backend database or central server. Your API keys, images, and conversation history never leave your local machine. **We cannot see your data.**
- **Bring Your Own Key (BYOK)**: Your API keys are stored locally in encrypted JSON files using AES-256 to protect them from potential local malware.
- **Secure Authentication**: The Google sign-in process happens entirely in your default web browser. The application itself never handles your password or email credentials.
- **End-to-End AI Chat**: Your conversations with AI providers are direct. Messages flow `you → provider → you`. We do not intercept, log, or have access to your prompts or completions.

### Important Notes on Image Handling (Google Lens Feature)

To enable the Google Lens integration, the selected screenshot must be accessible via a public URL. This process uses the ImgBB API.

- **Be Aware**: This means your image will be temporarily hosted on ImgBB's servers with a public link.
- **Recommendation**: If you do not trust ImgBB or are working with highly sensitive images, we advise **not using the built-in Google Lens feature**. Instead, you can manually visit [lens.google.com](https://lens.google.com) and upload your image directly.

---

## Platform-Specific Security Notes

- **macOS**: As an open-source application not notarized by an official Apple Developer account, the first launch will likely be blocked by **Gatekeeper**. You must explicitly allow the application to run in **System Settings > Privacy & Security**.
- **Windows**: Windows Defender SmartScreen may flag the installer or application as "unrecognized." You must click "More info" and select "Run anyway" to proceed. The installer is built with the trusted NSIS framework.
- **Linux**: You may need to grant execute permissions to the application binary (e.g., `chmod +x spatialshot`).
