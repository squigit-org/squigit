# TODO for SnapLLM

- **Support multiple AI providers via OpenAI-compatible library**:
  Decouple the application from the Google Gemini SDK. Integrate a library like `openai` (which supports multiple providers) to allow users to configure and use APIs for GPT, Claude, Grok, or any OpenAI-compatible endpoint.
  - _Why?_: Many users have existing subscriptions or credits with other providers and should be able to use SnapLLM as their universal interface.
  - _Implementation_: Refactor the AI service layer to use a provider-agnostic interface, update the settings panel for key management, and maintain the existing BYOK model.

- **Investigate an alternative to ImgBB for Google Lens**:
  Research and integrate a more privacy-focused or self-hosted solution for the temporary image hosting required by the "Open in Lens" feature.
  - _Why?_: To address user concerns about uploading potentially sensitive screenshots to a third-party service.
  - _Note_: A self-hosted solution would require maintaining server infrastructure.
