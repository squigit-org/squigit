/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export const useCopyToClipboard = (resetDelay = 2500) => {
  const [isCopied, setIsCopied] = useState(false);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), resetDelay);
      });
    },
    [resetDelay],
  );

  return { isCopied, copy };
};

export function useClipboard() {
  const readText = useCallback(async (): Promise<string> => {
    try {
      return await navigator.clipboard.readText();
    } catch (webErr) {
      console.warn(
        "Web Clipboard API failed, attempting Tauri fallback...",
        webErr,
      );
      try {
        return await invoke<string>("read_clipboard_text");
      } catch (tauriErr) {
        console.error("Tauri Clipboard API failed:", tauriErr);
        throw tauriErr;
      }
    }
  }, []);

  const writeText = useCallback(async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
  }, []);

  return { readText, writeText };
}
