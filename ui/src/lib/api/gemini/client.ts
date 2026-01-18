/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat, Part } from "@google/genai";

let ai: GoogleGenAI | null = null;

export const initializeGemini = (apiKey: string) => {
  ai = new GoogleGenAI({ apiKey });
};

const cleanBase64 = (data: string) => {
  return data.replace(/^data:image\/[a-z]+;base64,/, "");
};

export const startNewChatStream = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  onToken: (token: string) => void
): Promise<{ text: string; chat: Chat }> => {
  if (!ai) throw new Error("Gemini AI not initialized");

  const chat = ai.chats.create({
    model: modelId,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  const parts: Part[] = [
    {
      inlineData: {
        mimeType,
        data: cleanBase64(imageBase64),
      },
    },
    {
      text: systemPrompt,
    },
  ];

  try {
    let fullText = "";

    const stream = await chat.sendMessageStream({
      message: parts,
    });

    for await (const chunk of stream) {
      const token = chunk.text || "";
      if (token) {
        fullText += token;
        await new Promise((resolve) => setTimeout(resolve, 50));
        onToken(token);
      }
    }

    return { text: fullText || "No response text generated.", chat };
  } catch (error) {
    console.error("Streaming error, falling back:", error);
    try {
      const response = await chat.sendMessage({
        message: parts,
      });
      const text = response.text || "No response text generated.";
      const words = text.split(" ");
      for (const word of words) {
        onToken(word + " ");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { text, chat };
    } catch (fallbackError) {
      console.error("Error starting chat:", fallbackError);
      throw fallbackError;
    }
  }
};

export const sendMessage = async (chat: Chat, text: string): Promise<string> => {
  try {
    const response = await chat.sendMessage({
      message: text,
    });

    return response.text || "No response text generated.";
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};
