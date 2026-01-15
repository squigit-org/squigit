/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";
import { titlePrompt } from "../../../lib/config/prompts";

const TITLE_MODEL = "gemini-flash-lite-latest";

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

    if (startupImage.isFilePath && startupImage.base64.startsWith("asset://")) {
      return;
    }

    setIsGenerating(true);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const promptMatch = titlePrompt.match(/chat-title-prmp: \|\n([\s\S]+)/);
      const systemPrompt = promptMatch
        ? promptMatch[1]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(" ")
        : "Generate a 2-3 word title describing this image.";

      const cleanBase64 = startupImage.base64.replace(
        /^data:image\/[a-z]+;base64,/,
        ""
      );

      const response = await ai.models.generateContent({
        model: TITLE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: startupImage.mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: systemPrompt,
              },
            ],
          },
        ],
      });

      const title = response.text?.trim() || "New Chat";
      setSessionChatTitle(title);
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

  return {
    chatTitle: sessionChatTitle || "New Chat",
    isGeneratingTitle: isGenerating,
  };
};
