/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const TITLE_MODEL = "gemini-2.5-flash";

interface UseChatTitleProps {
  startupImage: {
    path: string;
    mimeType: string;
    imageId: string;
  } | null;
  apiKey: string;
  sessionChatTitle: string | null;
  setSessionChatTitle: (title: string) => void;
}

export const useChatTitle = ({
  startupImage,
  apiKey,
  sessionChatTitle,
  setSessionChatTitle,
}: UseChatTitleProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateTitle = useCallback(async () => {
    if (!startupImage?.path || !apiKey || sessionChatTitle) {
      return;
    }

    setIsGenerating(true);

    try {
      const title = await invoke<string>("generate_chat_title", {
        apiKey,
        model: TITLE_MODEL,
        imagePath: startupImage.path,
      });

      console.log(`[ChatTitleTracker] Selected Model: ${TITLE_MODEL}`);
      console.log(
        `[ChatTitleTracker] Generated Chat Title: "${title || "New Chat"}"`,
      );
      setSessionChatTitle(title || "New Chat");
    } catch (error) {
      console.error("Failed to generate chat title:", error);
      setSessionChatTitle("New Chat");
    } finally {
      setIsGenerating(false);
    }
  }, [startupImage, apiKey, sessionChatTitle, setSessionChatTitle]);

  useEffect(() => {
    generateTitle();
  }, [generateTitle]);

  const generateTitleForImage = useCallback(
    async (
      imagePath: string,
      _mimeType: string,
      _existingTitles: string[] = [],
    ): Promise<string> => {
      if (!apiKey) return "New Chat";

      try {
        const title = await invoke<string>("generate_chat_title", {
          apiKey,
          model: TITLE_MODEL,
          imagePath,
        });

        console.log(`[ChatTitleTracker] Selected Model: ${TITLE_MODEL}`);
        console.log(
          `[ChatTitleTracker] Generated Chat Title: "${title || "New Chat"}"`,
        );
        return title || "New Chat";
      } catch (error) {
        console.error("Failed to generate image title:", error);
        return "New Chat";
      }
    },
    [apiKey],
  );

  return {
    chatTitle: sessionChatTitle || "New Chat",
    isGeneratingTitle: isGenerating,
    generateImageTitle: generateTitleForImage,
  };
};
