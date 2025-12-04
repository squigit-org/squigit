# TODO for Spatialshot

* **Add a taskbar/dock icon for quick launch**:
Implement a persistent system tray (Windows/Linux) or menu bar (macOS) icon to provide quick access to the main window or a new capture, improving accessibility beyond the global hotkey.
* **Add a "Spatialshot Upload" feature within active chat**: Introduce a new button in the chat prompt box that allows users to capture a new screenshot *without* starting a new chat. The captured image should be inserted into the current conversation as a user message, enabling continuous multi-modal dialogue.
  * *Implementation Flow*: Button click → Hide main app window → Trigger standard capture flow via Orchestrator → Return the final image to the current chat view as an uploaded asset.
  * *Why?*: Users engaged in an ongoing analysis may need to provide additional visual context without breaking their conversational thread.
* **Modernize the LLM chat interface**:
Implement standard chat application features to improve usability and match user expectations.
  * *Features*: Edit previous messages, stop an ongoing AI response, switch the AI model within the same chat, save/load chat history, and reply to specific messages.
* **Add a dedicated image editing tab**: Create a new browser tab within the Electron application (separate from the React chat) dedicated to viewing and editing the captured screenshot. Features should include drawing, adding text, and copying the final image to the clipboard, inspired by tools like Flameshot.
  * *Goal*: Provide built-in, lightweight editing capabilities without needing an external image editor.

* **Support multiple AI providers via OpenAI-compatible library**:
Decouple the application from the Google Gemini SDK. Integrate a library like `openai` (which supports multiple providers) to allow users to configure and use APIs for GPT, Claude, Grok, or any OpenAI-compatible endpoint.
  * *Why?*: Many users have existing subscriptions or credits with other providers and should be able to use Spatialshot as their universal interface.
  * *Implementation*: Refactor the AI service layer to use a provider-agnostic interface, update the settings panel for key management, and maintain the existing BYOK model.

* **Add a standard rectangular selection to `drawview`**: Currently, the overlay only supports a freeform "squiggle" draw-to-crop. Add an option (e.g., via a modifier key or toggle) to allow users to drag a precise rectangular selection area, which is the standard screen capture method on desktop.
* **Improve the `drawview` painting aesthetic**: Enhance the visual design of the drawing overlay with more sophisticated glow effects, smoother lines, or an "AI-themed" visual style to make the interaction feel more polished and futuristic.

* **Investigate an alternative to ImgBB for Google Lens**:
Research and integrate a more privacy-focused or self-hosted solution for the temporary image hosting required by the "Open in Lens" feature.
  * *Why?*: To address user concerns about uploading potentially sensitive screenshots to a third-party service.
  * *Note*: A self-hosted solution would require maintaining server infrastructure.
* **Implement differential updates for installers**:
Improve the bootstrap installer logic to download only the application components that have changed since the last update, rather than re-downloading the entire package set every time.
  * *Implementation*: This requires the CI pipeline to generate and publish a manifest of component versions and checksums. The installer must compare this against the local installation state.
