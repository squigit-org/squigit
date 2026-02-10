/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let currentAbortController: AbortController | null = null;

// Types matching Backend structs
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

export type Content = GeminiContent;

// State
let storedApiKey: string | null = null;
let currentModelId = "gemini-2.0-flash";

// Brain context state - persists across turns
let imageDescription: string | null = null;
let userFirstMsg: string | null = null;
let conversationHistory: Array<{ role: string; content: string }> = [];
let storedImageBase64: string | null = null;
let storedMimeType: string | null = null;

interface GeminiEvent {
  token: string;
}

export const initializeGemini = (apiKey: string) => {
  storedApiKey = apiKey;
};

const cleanBase64 = (data: string) => {
  return data.replace(/^data:image\/[a-z]+;base64,/, "");
};

/**
 * Reset brain context for a new chat session.
 */
export const resetBrainContext = () => {
  imageDescription = null;
  userFirstMsg = null;
  conversationHistory = [];
  storedImageBase64 = null;
  storedMimeType = null;
};

/**
 * Set the image description (AI's first response) for context anchoring.
 */
export const setImageDescription = (description: string) => {
  imageDescription = description;
};

/**
 * Get the current image description.
 */
export const getImageDescription = () => imageDescription;

/**
 * Set the user's first message for intent anchoring.
 */
export const setUserFirstMsg = (msg: string) => {
  if (!userFirstMsg && msg) {
    userFirstMsg = msg;
  }
};

/**
 * Add a message to conversation history.
 */
export const addToHistory = (role: "User" | "Assistant", content: string) => {
  conversationHistory.push({ role, content });
  // Keep only last 6 messages (3 turns)
  if (conversationHistory.length > 6) {
    conversationHistory = conversationHistory.slice(-6);
  }
};

/**
 * Format history for the frame template.
 */
const formatHistoryLog = (): string => {
  if (conversationHistory.length === 0) return "(No previous messages)";

  return conversationHistory
    .map(({ role, content }) => `**${role}**: ${content}`)
    .join("\n\n");
};

export const startNewChatSync = async (
  apiKey: string,
  modelId: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ title: string; content: string }> => {
  // Reset brain state for new session
  resetBrainContext();

  const response = await invoke<{ title: string; content: string }>(
    "start_chat_sync",
    {
      apiKey,
      model: modelId,
      imageBase64: cleanBase64(imageBase64),
      imageMimeType: mimeType,
    },
  );

  // Store for subsequent turns
  storedImageBase64 = cleanBase64(imageBase64);
  storedMimeType = mimeType;

  // Initialize brain state with the response
  setImageDescription(response.content);
  addToHistory("Assistant", response.content);

  return response;
};

/**
 * Start a new chat with an image (initial turn).
 * Uses brain v2 with soul.yml + scenes.json.
 */
export const startNewChatStream = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
  onToken: (token: string) => void,
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  currentModelId = modelId;

  // Reset context for new chat
  resetBrainContext();
  storedImageBase64 = cleanBase64(imageBase64);
  storedMimeType = mimeType;

  const channelId = `gemini-stream-${Date.now()}`;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    fullResponse += event.payload.token;
    onToken(event.payload.token);
  });

  try {
    await invoke("stream_gemini_chat_v2", {
      apiKey: storedApiKey,
      model: modelId,
      isInitialTurn: true,
      imageBase64: cleanBase64(imageBase64),
      imageMimeType: mimeType,
      imageDescription: null,
      userFirstMsg: null,
      historyLog: null,
      userMessage: "",
      channelId: channelId,
    });

    unlisten();
    currentAbortController = null;

    // Store AI's first response as image description
    setImageDescription(fullResponse);
    addToHistory("Assistant", fullResponse);

    return fullResponse;
  } catch (error) {
    unlisten();
    currentAbortController = null;
    console.error("Backend stream error:", error);
    throw error;
  }
};

/**
 * Send a subsequent message (uses frame.md context).
 */
export const sendMessage = async (
  text: string,
  modelId?: string,
  onToken?: (token: string) => void,
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");
  if (!imageDescription) throw new Error("No active chat session");

  if (modelId) {
    currentModelId = modelId;
  }

  // Track user's first message for intent
  const isFirstTurnWithImage = !userFirstMsg && storedImageBase64;
  setUserFirstMsg(text);
  addToHistory("User", text);

  const channelId = `gemini-stream-${Date.now()}`;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    fullResponse += event.payload.token;
    onToken?.(event.payload.token);
  });

  try {
    await invoke("stream_gemini_chat_v2", {
      apiKey: storedApiKey,
      model: currentModelId,
      isInitialTurn: false,
      imageBase64: isFirstTurnWithImage ? storedImageBase64 : null,
      imageMimeType: isFirstTurnWithImage ? storedMimeType : null,
      imageDescription: imageDescription,
      userFirstMsg: userFirstMsg,
      historyLog: formatHistoryLog(),
      userMessage: text,
      channelId: channelId,
    });

    unlisten();

    addToHistory("Assistant", fullResponse);

    return fullResponse;
  } catch (error) {
    unlisten();
    console.error("SendMessage error:", error);
    throw error;
  }
};

/**
 * Restore a session from saved state.
 */
export const restoreSession = (
  modelId: string,
  savedImageDescription: string,
  savedUserFirstMsg: string | null,
  savedHistory: Array<{ role: string; content: string }>,
) => {
  currentModelId = modelId;
  imageDescription = savedImageDescription;
  userFirstMsg = savedUserFirstMsg;
  conversationHistory = savedHistory.slice(-6); // Keep last 6
};

/**
 * Get current session state for saving.
 */
export const getSessionState = () => ({
  imageDescription,
  userFirstMsg,
  conversationHistory: [...conversationHistory],
});

// Legacy compatibility - startNewChat wraps stream version
export const startNewChat = async (
  modelId: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> => {
  let fullText = "";
  await startNewChatStream(modelId, imageBase64, mimeType, (token) => {
    fullText += token;
  });
  return fullText;
};
