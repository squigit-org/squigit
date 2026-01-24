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
              // Remove data URL prefix to get raw base64
              const base64 = result.replace(/^data:image\/[a-z]+;base64,/, "");
              resolve(base64);
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
        imageBase64 = startupImage.base64.replace(
          /^data:image\/[a-z]+;base64,/,
          "",
        );
      }

      const response = await ai.models.generateContent({
        model: TITLE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: imageMimeType,
                  data: imageBase64,
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
    generateImageTitle: generateTitleForImage,
  };
};
