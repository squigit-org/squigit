# TODO for SnapLLM

- **Add a "SnapLLM Upload" feature within active chat**: Introduce a new button in the chat prompt box that allows users to capture a new screenshot _without_ starting a new chat. The captured image should be inserted into the current conversation as a user message, enabling continuous multi-modal dialogue.
  - _Implementation Flow_: Button click → Hide main app window → Trigger standard capture flow via Orchestrator → Return the final image to the current chat view as an uploaded asset.
  - _Why?_: Users engaged in an ongoing analysis may need to provide additional visual context without breaking their conversational thread.

- **Modernize the LLM chat interface**:
  Implement standard chat application features to improve usability and match user expectations.
  - _Features_: Edit previous messages, stop an ongoing AI response, switch the AI model within the same chat, save/load chat history, and reply to specific messages.

- **Support multiple AI providers via OpenAI-compatible library**:
  Decouple the application from the Google Gemini SDK. Integrate a library like `openai` (which supports multiple providers) to allow users to configure and use APIs for GPT, Claude, Grok, or any OpenAI-compatible endpoint.
  - _Why?_: Many users have existing subscriptions or credits with other providers and should be able to use SnapLLM as their universal interface.
  - _Implementation_: Refactor the AI service layer to use a provider-agnostic interface, update the settings panel for key management, and maintain the existing BYOK model.

- **Investigate an alternative to ImgBB for Google Lens**:
  Research and integrate a more privacy-focused or self-hosted solution for the temporary image hosting required by the "Open in Lens" feature.
  - _Why?_: To address user concerns about uploading potentially sensitive screenshots to a third-party service.
  - _Note_: A self-hosted solution would require maintaining server infrastructure.
