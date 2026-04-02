/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { geminiStore } from "./store";
import { GeminiEvent } from "./gemini.types";
import { setUserFirstMsg, addToHistory } from "./context";
import { buildContextWindow, maybeCompressHistory } from "./summarize";

export const sendMessage = async (
  text: string,
  modelId?: string,
  onToken?: (token: string) => void,
  chatId?: string | null,
): Promise<string> => {
  if (!geminiStore.storedApiKey) throw new Error("Gemini API Key not set");
  if (!geminiStore.imageDescription) throw new Error("No active chat session");

  if (modelId) {
    geminiStore.currentModelId = modelId;
  }

  const myGenId = geminiStore.generationId;
  setUserFirstMsg(text);
  addToHistory("User", text);

  const channelId = `gemini-stream-${Date.now()}`;
  geminiStore.currentChannelId = channelId;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    if (geminiStore.generationId !== myGenId) return;
    fullResponse += event.payload.token;
    onToken?.(event.payload.token);
  });
  geminiStore.currentUnlisten = unlisten;

  try {
    console.log(`[GeminiClient] Sending Message`);
    console.log(`[GeminiClient] Target Model: ${geminiStore.currentModelId}`);
    console.log(`[GeminiClient] Prompt: "${text}"`);
    console.log(
      `[GeminiClient] Image Brief Present: ${Boolean(geminiStore.imageBrief)}`,
    );

    const { historyLog, rollingSummary } = buildContextWindow();

    await invoke("stream_gemini_chat_v2", {
      apiKey: geminiStore.storedApiKey,
      model: geminiStore.currentModelId,
      isInitialTurn: false,
      imagePath: null, // Image never re-sent, brief is used instead
      imageDescription: geminiStore.imageDescription,
      userFirstMsg: geminiStore.userFirstMsg,
      historyLog,
      rollingSummary,
      userMessage: text,
      channelId: channelId,
      userName: geminiStore.userName,
      userEmail: geminiStore.userEmail,
      userInstruction: null, // One-time intent hook only sent on initial turn
      imageBrief: geminiStore.imageBrief,
    });
    unlisten();
    if (geminiStore.currentUnlisten === unlisten)
      geminiStore.currentUnlisten = null;

    if (geminiStore.generationId !== myGenId) throw new Error("CANCELLED");

    addToHistory("Assistant", fullResponse);

    // Fire-and-forget: compress older turns if threshold reached
    maybeCompressHistory(chatId ?? null);

    console.log(
      `[GeminiClient] Stream Completed. Final Response: "${fullResponse}"`,
    );
    return fullResponse;
  } catch (error) {
    unlisten();
    if (geminiStore.currentUnlisten === unlisten)
      geminiStore.currentUnlisten = null;
    if (error instanceof Error && error.message === "CANCELLED") throw error;
    console.error("SendMessage error:", error);
    throw error;
  }
};
