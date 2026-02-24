/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const TITLE_MODEL = "gemini-2.5-flash";

interface UseChatTitleProps {
  apiKey: string;
}

export const useChatTitle = ({
  apiKey,
}: UseChatTitleProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateTitleForText = useCallback(
    async (
      text: string,
    ): Promise<string> => {
      if (!apiKey || !text) return "New Chat";
      
      setIsGenerating(true);

      try {
        const title = await invoke<string>("generate_chat_title", {
          apiKey,
          model: "gemini-2.5-flash-lite",
          promptContext: text,
        });

        console.log(`[ChatTitleTracker] Selected Model: gemini-2.5-flash-lite`);
        console.log(
          `[ChatTitleTracker] Generated Chat Title: "${title || "New Chat"}"`,
        );
        return title || "New Chat";
      } catch (liteError) {
        console.warn("Failed to generate text title with lite model, falling back to flash:", liteError);
        
        try {
          const fallbackTitle = await invoke<string>("generate_chat_title", {
            apiKey,
            model: TITLE_MODEL,
            promptContext: text,
          });

          console.log(`[ChatTitleTracker] Selected Model: ${TITLE_MODEL} (Fallback)`);
          console.log(
            `[ChatTitleTracker] Generated Chat Title: "${fallbackTitle || "New Chat"}"`,
          );
          return fallbackTitle || "New Chat";
        } catch (flashError) {
          console.error("Failed to generate text title with fallback model:", flashError);
          return "New Chat";
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [apiKey],
  );

  return {
    isGeneratingTitle: isGenerating,
    generateTitleForText,
  };
};
