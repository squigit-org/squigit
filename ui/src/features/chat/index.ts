/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

// components
export * from "./components/ChatBubble/ChatBubble";

export * from "./components/ChatInput/ChatInput";

export { ImageArtifact } from "./components/ImageArtifact/ImageArtifact";
export { AttachmentStrip } from "./components/AttachmentStrip/AttachmentStrip";
export type { AttachmentStripProps } from "./components/AttachmentStrip/AttachmentStrip";
export { useAttachments } from "./components/AttachmentStrip/useAttachments";
export type { Attachment } from "./components/AttachmentStrip/attachment.types";
export {
  IMAGE_EXTENSIONS,
  ACCEPTED_EXTENSIONS,
  isImageExtension,
  getExtension,
  parseAttachmentPaths,
  stripAttachmentMentions,
  buildAttachmentMention,
  attachmentFromPath,
} from "./components/AttachmentStrip/attachment.types";

export * from "./components/ImageArtifact/ImageSearchInput";
export * from "./components/ImageArtifact/ImageTextMenu";
export * from "./components/ImageArtifact/ImageToolbar";

// hooks
export * from "./hooks/useChat";
export * from "./hooks/useChatTitle";
export * from "./hooks/useChatHistory";

// types
export * from "./chat.types";

// features
export * from "./Chat";
