/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import type { Attachment } from "@squigit/core/brain/attachments";
import { attachmentFromPath } from "@squigit/core/brain/attachments";

export function useAttachments() {
  const [attachments, setAttachmentsState] = useState<Attachment[]>([]);

  const setAttachments = useCallback((nextAttachments: Attachment[]) => {
    setAttachmentsState(nextAttachments);
  }, []);

  const addAttachments = useCallback((newOnes: Attachment[]) => {
    setAttachmentsState((prev) => [
      ...prev,
      ...newOnes,
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachmentsState((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachmentsState([]);
  }, []);

  const addFromPath = useCallback(
    (path: string, id?: string) => {
      addAttachments([attachmentFromPath(path, id)]);
    },
    [addAttachments],
  );

  return {
    attachments,
    setAttachments,
    addAttachments,
    addFromPath,
    removeAttachment,
    clearAttachments,
  };
}
