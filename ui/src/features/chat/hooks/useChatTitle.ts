/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const TITLE_MODEL = "gemini-2.0-flash-lite";

interface UseChatTitleProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  apiKey: string;
  sessionChatTitle: string | null;
  setSessionChatTitle: (title: string) => void;
}

const cleanBase64 = (data: string) => {
  return data.replace(/^data:image\/[a-z]+;base64,/, "");
};

export const useChatTitle = ({
  startupImage,
  apiKey,
  sessionChatTitle,
  setSessionChatTitle,
}: UseChatTitleProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateTitle = useCallback(async () => {
    if (!startupImage?.base64 || !apiKey || sessionChatTitle) {
      return;
    }

    setIsGenerating(true);

    try {
      let imageBase64: string;
      let imageMimeType = startupImage.mimeType;

      // If this is a file path (asset URL), fetch the actual image data
      if (startupImage.isFilePath) {
        try {
          const response = await fetch(startupImage.base64);
          const blob = await response.blob();
          imageMimeType = blob.type || "image/png";

          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(cleanBase64(result));
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(blob);
          imageBase64 = await base64Promise;
        } catch (e) {
          console.error("Failed to fetch image for title generation:", e);
          setSessionChatTitle("New Chat");
          return;
        }
      } else {
        imageBase64 = cleanBase64(startupImage.base64);
      }

      // Call backend title generation command
      const title = await invoke<string>("generate_chat_title", {
        apiKey,
        model: TITLE_MODEL,
        imageBase64,
        imageMimeType,
      });

      setSessionChatTitle(title || "New Chat");
    } catch (error) {
      console.error("Failed to generate chat title:", error);
      // Don't set state to "New Chat" on error, so we can retry if API key changes
    } finally {
      setIsGenerating(false);
    }
  }, [startupImage, apiKey, sessionChatTitle, setSessionChatTitle]);

  useEffect(() => {
    generateTitle();
  }, [generateTitle]);

  const generateTitleForImage = useCallback(
    async (
      base64Data: string,
      mimeType: string,
      _existingTitles: string[] = [],
    ): Promise<string> => {
      if (!apiKey) return "New Chat";

      try {
        const cleanedBase64 = cleanBase64(base64Data);

        // Call backend title generation command
        const title = await invoke<string>("generate_chat_title", {
          apiKey,
          model: TITLE_MODEL,
          imageBase64: cleanedBase64,
          imageMimeType: mimeType,
        });

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
