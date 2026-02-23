/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export { AttachmentStrip } from "./AttachmentStrip";
export type { AttachmentStripProps } from "./AttachmentStrip";
export { useAttachments } from "./useAttachments";
export type { Attachment } from "./attachment.types";
export {
  IMAGE_EXTENSIONS,
  ACCEPTED_EXTENSIONS,
  isImageExtension,
  getExtension,
  parseAttachmentPaths,
  stripAttachmentMentions,
  buildAttachmentMention,
  attachmentFromPath,
} from "./attachment.types";
