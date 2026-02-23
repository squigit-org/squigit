/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "./attachment.types";
import { attachmentFromPath } from "./attachment.types";

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachments = useCallback((newOnes: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newOnes]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      // Fire-and-forget: delete /tmp files on remove
      if (target?.isTemp) {
        invoke("delete_temp_file", { path: target.path }).catch(() => {});
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      // Delete all temp files
      prev
        .filter((a) => a.isTemp)
        .forEach((a) => {
          invoke("delete_temp_file", { path: a.path }).catch(() => {});
        });
      return [];
    });
  }, []);

  /** Add a CAS-stored attachment directly from its path */
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
