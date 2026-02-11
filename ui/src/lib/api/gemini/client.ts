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
 * Retry (regenerate) an assistant message at a given index.
 * Rebuilds brain context from messages before that index and regenerates.
 *
 * @param messageIndex 0-based index of the assistant message to retry
 * @param allMessages  all messages up to (but not including) the target
 * @param onToken      streaming token callback
 * @returns the full regenerated response text
 */
export const retryFromMessage = async (
  messageIndex: number,
  allMessages: Array<{ role: string; text: string }>,
  modelId: string,
  onToken?: (token: string) => void,
  fallbackImage?: { base64: string; mimeType: string },
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  currentModelId = modelId;

  // Restore image from fallback if context was lost
  if ((!storedImageBase64 || !storedMimeType) && fallbackImage) {
    storedImageBase64 = cleanBase64(fallbackImage.base64);
    storedMimeType = fallbackImage.mimeType;
  }

  // Special case: retrying the very first assistant message (image description)
  if (messageIndex === 0) {
    if (!storedImageBase64 || !storedMimeType) {
      throw new Error("Image not found");
    }

    // Reset brain context for fresh initial turn
    imageDescription = null;
    userFirstMsg = null;
    conversationHistory = [];

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
        isInitialTurn: true,
        imageBase64: storedImageBase64,
        imageMimeType: storedMimeType,
        imageDescription: null,
        userFirstMsg: null,
        historyLog: null,
        userMessage: "",
        channelId,
      });

      unlisten();

      // Update brain state with new response
      setImageDescription(fullResponse);
      conversationHistory = [{ role: "Assistant", content: fullResponse }];

      return fullResponse;
    } catch (error) {
      unlisten();
      throw error;
    }
  }

  // General case: retrying a subsequent assistant message
  // The image description is always allMessages[0] (the first assistant response)
  const imgDesc = allMessages[0]?.text || imageDescription || "";
  imageDescription = imgDesc;

  // Find the first user message in messages before the target
  const messagesBefore = allMessages.slice(0, messageIndex);
  const firstUser = messagesBefore.find((m) => m.role === "user");
  userFirstMsg = firstUser?.text || null;

  // Rebuild conversation history from messages before the target
  conversationHistory = messagesBefore.map((m) => ({
    role: m.role === "user" ? "User" : "Assistant",
    content: m.text,
  }));
  // Keep only last 6 entries
  if (conversationHistory.length > 6) {
    conversationHistory = conversationHistory.slice(-6);
  }

  // The last user message before the target assistant message
  const lastUserMsg = [...messagesBefore]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMsg) {
    throw new Error("No user message found before the retried message");
  }

  // Check if this is the first user turn (should re-send image)
  const isFirstTurnWithImage = !firstUser && storedImageBase64;

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
      imageDescription: imgDesc,
      userFirstMsg: userFirstMsg,
      historyLog: formatHistoryLog(),
      userMessage: lastUserMsg.text,
      channelId,
    });

    unlisten();

    // Update history with the new response
    addToHistory("Assistant", fullResponse);

    return fullResponse;
  } catch (error) {
    unlisten();
    throw error;
  }
};

/**
 * Edit a user message and regenerate response from that point.
 * Truncates history after the edited message.
 */
export const editUserMessage = async (
  messageIndex: number,
  newText: string,
  allMessages: Array<{ role: string; text: string }>,
  modelId: string,
  onToken?: (token: string) => void,
  fallbackImage?: { base64: string; mimeType: string },
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  currentModelId = modelId;

  // Restore image from fallback if context was lost
  if ((!storedImageBase64 || !storedMimeType) && fallbackImage) {
    storedImageBase64 = cleanBase64(fallbackImage.base64);
    storedMimeType = fallbackImage.mimeType;
  }

  // Find the messages BEFORE the one being edited
  const messagesBefore = allMessages.slice(0, messageIndex);

  // The first message is always the image description in our data model
  // (unless it's text-only chat, but currently we focus on image mainly)
  // `allMessages` here is UI messages. UI[0] is typically Model (Image Description).
  // So if messageIndex > 0, we have some history.

  // Rebuild brain state
  const imgDesc =
    messagesBefore.find((m) => m.role === "model")?.text ||
    imageDescription ||
    "";
  imageDescription = imgDesc;

  // Find the *first* user message in the history *before* this edit.
  // If we are editing the very first user message, `messagesBefore` will NOT contain a user message yet.
  const previousUserMsg = messagesBefore.find((m) => m.role === "user");

  if (!previousUserMsg) {
    // We are editing the FIRST user message
    userFirstMsg = newText;
  } else {
    // We are editing a subsequent message.
    // The first user message remains what it was in history.
    userFirstMsg = messagesBefore.find((m) => m.role === "user")?.text || null;
  }

  // Rebuild conversation history
  conversationHistory = messagesBefore.map((m) => ({
    role: m.role === "user" ? "User" : "Assistant",
    content: m.text,
  }));
  // Keep only last 6 entries (3 turns)
  if (conversationHistory.length > 6) {
    conversationHistory = conversationHistory.slice(-6);
  }

  // Check if this is the first turn with image
  // It is first turn if:
  // 1. We have an image (storedImageBase64)
  // 2. There were NO user messages before this one (meaning we are acting as the first user message)
  const isFirstTurnWithImage = !previousUserMsg && storedImageBase64;

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
      imageDescription: imgDesc,
      userFirstMsg: userFirstMsg,
      historyLog: formatHistoryLog(),
      userMessage: newText, // The NEW text
      channelId,
    });

    unlisten();

    // Update history with the user message AND the new response
    addToHistory("User", newText);
    addToHistory("Assistant", fullResponse);

    return fullResponse;
  } catch (error) {
    unlisten();
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
  savedImageBase64: string | null,
  savedMimeType: string | null,
) => {
  currentModelId = modelId;
  imageDescription = savedImageDescription;
  userFirstMsg = savedUserFirstMsg;
  conversationHistory = savedHistory.slice(-6); // Keep last 6
  storedImageBase64 = savedImageBase64;
  storedMimeType = savedMimeType;
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
