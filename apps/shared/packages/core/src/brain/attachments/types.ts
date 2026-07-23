/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export type AttachmentLifecycleStatus = "pending" | "ready" | "failed";

export interface AttachmentLifecycleError {
  code: string;
  message: string;
}

export type AttachmentFileType =
  | "text_local"
  | "image_upload"
  | "document_upload";

export interface Attachment {
  id: string;
  type: "image" | "file";
  name: string;
  extension: string;
  path: string;
  sourcePath?: string;
  attachmentHash?: string;
  casPath?: string;
  preparationJobId?: string;
  fileType?: AttachmentFileType;
  status?: AttachmentLifecycleStatus;
  error?: AttachmentLifecycleError | null;
}
