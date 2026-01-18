/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";
import { titlePrompt, subTitlePrompt } from "../../../lib/config/prompts";

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
        "",
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

  const generateSubTitle = useCallback(
    async (
      editDescription: string,
      existingTitles: string[] = [],
    ): Promise<string> => {
      if (!apiKey) return "Edit Request";

      try {
        const ai = new GoogleGenAI({ apiKey });

        const promptMatch = subTitlePrompt.match(
          /sub-title-prmp: \|\n([\s\S]+)/,
        );
        const parsedPrompt = promptMatch
          ? promptMatch[1]
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .join(" ")
          : "Summarize this user edit request into 2-3 words.";

        const titlesContext =
          existingTitles.length > 0
            ? `\n\nExisting titles (DO NOT USE ANY OF THESE): ${existingTitles.join(
                ", ",
              )}`
            : "";

        const response = await ai.models.generateContent({
          model: TITLE_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${parsedPrompt}${titlesContext}\n\nUser request: "${editDescription}"`,
                },
              ],
            },
          ],
        });

        return response.text?.trim() || "Edit Request";
      } catch (error) {
        console.error("Failed to generate sub-title:", error);
        return "Edit Request";
      }
    },
    [apiKey],
  );

  const generateImageTitle = useCallback(
    async (existingTitles: string[] = []): Promise<string> => {
      if (!startupImage?.base64 && !apiKey) return "New Chat";

      return "New Chat";
    },
    [startupImage, apiKey],
  );

  const generateTitleForImage = useCallback(
    async (
      base64Data: string,
      mimeType: string,
      existingTitles: string[] = [],
    ): Promise<string> => {
      if (!apiKey) return "New Chat";

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

        const titlesContext =
          existingTitles.length > 0
            ? `\n\nExisting titles (DO NOT USE ANY OF THESE): ${existingTitles.join(
                ", ",
              )}`
            : "";

        const cleanBase64 = base64Data.replace(
          /^data:image\/[a-z]+;base64,/,
          "",
        );

        const response = await ai.models.generateContent({
          model: TITLE_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: `${systemPrompt}${titlesContext}`,
                },
              ],
            },
          ],
        });

        return response.text?.trim() || "New Chat";
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
    generateSubTitle,
    generateImageTitle: generateTitleForImage,
  };
};
