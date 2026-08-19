# Squigit Brain Usage Walkthrough

This document outlines how the `@crates/squigit-brain` package is utilized within the Desktop Renderer.

## Overview

`squigit-brain` is a core Rust crate that handles the heavy lifting for LLM (Language Model) interactions, attachment processing, and thread management.
It is integrated into the Desktop app through the following pipeline:

1. **Rust Crate**: `crates/squigit-brain` defines the core logic.
2. **Rust Facade**: `squigit-rs` re-exports it.
3. **NAPI Bridge**: `crates/napi-bridge` exposes these functions to Node.js as a native addon.
4. **Electron IPC**: The main process (`apps/desktop`) bridges the NAPI calls to the frontend via `apps/desktop/src/preload/bridge.ts`.
5. **Renderer/App**: The frontend (`apps/renderer` and `packages/app`) consumes these via `ports.provider` and `ports.system`.

## Exposed Commands

The following table details every command currently exposed from `squigit-brain` and consumed by the Desktop UI.

| Command                        | Role                                                                                                                                                           | Consumer (Renderer / App layer)                                                                                                                                                                                                                            |
| :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streamThread`                 | Streams the LLM conversation response in real-time. This is the core function for generating thread replies, managing context, and handling conversation flow. | [conversation-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/conversation-controller.ts)                                                                                                                             |
| `setModelDiscoveryProfile`     | Configures the active user profile so the backend knows which API keys/cloud providers are available to discover available models.                             | [application.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/application.ts), [squigitApplication.ts](file:///home/a7md/squigit.org/squigit-desktop/apps/renderer/src/runtime/squigitApplication.ts)                             |
| `buildModelAttemptPlan`        | Evaluates the task requirements and effort to select the most appropriate models, creating a fallback sequence (attempt plan).                                 | [conversation-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/conversation-controller.ts), [application.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/application.ts)                     |
| `suggestThreadTitle`           | Automatically generates a concise and relevant title for a conversation thread based on the initial messages using an LLM.                                     | [useThreadCatalog.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/react/useThreadCatalog.ts), [application.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/application.ts)                                    |
| `prepareAttachment`            | Initiates a background job to process an attachment (e.g., resizing images, extracting text from PDFs) before it's sent to the LLM.                            | [attachment-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/attachment-controller.ts)                                                                                                                                 |
| `cancelAttachment`             | Cancels an ongoing attachment preparation job, usually triggered when a user removes an attachment from the input field before sending.                        | [attachment-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/attachment-controller.ts)                                                                                                                                 |
| `prepareSubmissionAttachments` | Finalizes a batch of attachments right before submission, ensuring they are hashed and ready for the LLM request payload.                                      | [attachment-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/attachment-controller.ts)                                                                                                                                 |
| `cancelRequest`                | Aborts an ongoing LLM generation request or submission. Triggered when the user clicks "Stop generating".                                                      | [conversation-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/conversation-controller.ts), [attachment-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/attachment-controller.ts) |
| `requestQuickAnswer`           | Requests a fast, potentially lower-latency response from the model, skipping some of the heavier prompt engineering or context windows.                        | [conversation-controller.ts](file:///home/a7md/squigit.org/squigit-desktop/packages/app/src/thread/conversation-controller.ts)                                                                                                                             |
| `cancelAllAttachmentJobs`      | _Exposed via NAPI_ to cancel all background attachment processing globally, though currently not actively invoked by the frontend controllers.                 | _Unused in current frontend codebase_                                                                                                                                                                                                                      |

> [!NOTE]
> While `streamThread` handles the most complex data and is the heaviest operation, features like `suggestThreadTitle` and attachment preparations (`prepareAttachment`) are essential utility interactions that make the UI feel responsive without blocking the main thread.
