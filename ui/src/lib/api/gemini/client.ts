/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let currentAbortController: AbortController | null = null;
let currentUnlisten: (() => void) | null = null;
let currentChannelId: string | null = null;
let generationId = 0;

export const cancelCurrentRequest = () => {
  generationId++;
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (currentUnlisten) {
    currentUnlisten();
    currentUnlisten = null;
  }
  if (currentChannelId) {
    invoke("cancel_gemini_request", { channelId: currentChannelId }).catch(
      console.error,
    );
    currentChannelId = null;
  }
};

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

let storedApiKey: string | null = null;
let currentModelId = "gemini-2.0-flash";

let imageDescription: string | null = null;
let userFirstMsg: string | null = null;
let conversationHistory: Array<{ role: string; content: string }> = [];
let storedImagePath: string | null = null;

interface GeminiEvent {
  token: string;
}

export const initializeGemini = (apiKey: string) => {
  storedApiKey = apiKey;
};

export const resetBrainContext = () => {
  imageDescription = null;
  userFirstMsg = null;
  conversationHistory = [];
  storedImagePath = null;
};

export const setImageDescription = (description: string) => {
  imageDescription = description;
};

export const getImageDescription = () => imageDescription;

export const setUserFirstMsg = (msg: string) => {
  if (!userFirstMsg && msg) {
    userFirstMsg = msg;
  }
};

export const addToHistory = (role: "User" | "Assistant", content: string) => {
  conversationHistory.push({ role, content });

  if (conversationHistory.length > 6) {
    conversationHistory = conversationHistory.slice(-6);
  }
};

const formatHistoryLog = (): string => {
  if (conversationHistory.length === 0) return "(No previous messages)";

  return conversationHistory
    .map(({ role, content }) => `**${role}**: ${content}`)
    .join("\n\n");
};

export const startNewChatStream = async (
  modelId: string,
  imagePath: string,
  onToken: (token: string) => void,
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  cancelCurrentRequest();
  currentAbortController = new AbortController();
  currentModelId = modelId;
  const myGenId = generationId;

  resetBrainContext();
  storedImagePath = imagePath;

  const channelId = `gemini-stream-${Date.now()}`;
  currentChannelId = channelId;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    if (generationId !== myGenId) return;
    fullResponse += event.payload.token;
    onToken(event.payload.token);
  });
  currentUnlisten = unlisten;

  try {
    console.log(`[GeminiClient] Starting New Stream`);
    console.log(`[GeminiClient] Target Model: ${modelId}`);

    await invoke("stream_gemini_chat_v2", {
      apiKey: storedApiKey,
      model: modelId,
      isInitialTurn: true,
      imageBase64: null,
      imageMimeType: null,
      imagePath,
      imageDescription: null,
      userFirstMsg: null,
      historyLog: null,
      userMessage: "",
      channelId: channelId,
    });

    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;
    currentAbortController = null;

    if (generationId !== myGenId) throw new Error("CANCELLED");

    setImageDescription(fullResponse);
    addToHistory("Assistant", fullResponse);

    console.log(
      `[GeminiClient] Stream Completed successfully. Length: ${fullResponse.length} chars.`,
    );
    return fullResponse;
  } catch (error) {
    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;
    currentAbortController = null;
    if (error instanceof Error && error.message === "CANCELLED") throw error;
    console.error("Backend stream error:", error);
    throw error;
  }
};

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

  const myGenId = generationId;
  const isFirstTurnWithImage = !userFirstMsg && storedImagePath;
  setUserFirstMsg(text);
  addToHistory("User", text);

  const channelId = `gemini-stream-${Date.now()}`;
  currentChannelId = channelId;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    if (generationId !== myGenId) return;
    fullResponse += event.payload.token;
    onToken?.(event.payload.token);
  });
  currentUnlisten = unlisten;

  try {
    console.log(`[GeminiClient] Sending Message`);
    console.log(`[GeminiClient] Target Model: ${currentModelId}`);
    console.log(`[GeminiClient] Prompt: "${text}"`);
    console.log(
      `[GeminiClient] Has Initial Image Active: ${Boolean(isFirstTurnWithImage)}`,
    );

    await invoke("stream_gemini_chat_v2", {
      apiKey: storedApiKey,
      model: currentModelId,
      isInitialTurn: false,
      imageBase64: null,
      imageMimeType: null,
      imagePath: isFirstTurnWithImage ? storedImagePath : null,
      imageDescription: imageDescription,
      userFirstMsg: userFirstMsg,
      historyLog: formatHistoryLog(),
      userMessage: text,
      channelId: channelId,
    });

    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;

    if (generationId !== myGenId) throw new Error("CANCELLED");

    addToHistory("Assistant", fullResponse);

    console.log(
      `[GeminiClient] Stream Completed. Final Response: "${fullResponse}"`,
    );
    return fullResponse;
  } catch (error) {
    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;
    if (error instanceof Error && error.message === "CANCELLED") throw error;
    console.error("SendMessage error:", error);
    throw error;
  }
};

export const retryFromMessage = async (
  messageIndex: number,
  allMessages: Array<{ role: string; text: string }>,
  modelId: string,
  onToken?: (token: string) => void,
  fallbackImagePath?: string,
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  currentModelId = modelId;
  const myGenId = generationId;

  if (!storedImagePath && fallbackImagePath) {
    storedImagePath = fallbackImagePath;
  }

  if (messageIndex === 0) {
    if (!storedImagePath) {
      throw new Error("Image not found");
    }

    imageDescription = null;
    userFirstMsg = null;
    conversationHistory = [];

    const channelId = `gemini-stream-${Date.now()}`;
    currentChannelId = channelId;
    let fullResponse = "";

    const unlisten = await listen<GeminiEvent>(channelId, (event) => {
      if (generationId !== myGenId) return;
      fullResponse += event.payload.token;
      onToken?.(event.payload.token);
    });
    currentUnlisten = unlisten;

    try {
      await invoke("stream_gemini_chat_v2", {
        apiKey: storedApiKey,
        model: currentModelId,
        isInitialTurn: true,
        imageBase64: null,
        imageMimeType: null,
        imagePath: storedImagePath,
        imageDescription: null,
        userFirstMsg: null,
        historyLog: null,
        userMessage: "",
        channelId,
      });

      unlisten();
      if (currentUnlisten === unlisten) currentUnlisten = null;

      if (generationId !== myGenId) throw new Error("CANCELLED");

      setImageDescription(fullResponse);
      conversationHistory = [{ role: "Assistant", content: fullResponse }];

      return fullResponse;
    } catch (error) {
      unlisten();
      if (currentUnlisten === unlisten) currentUnlisten = null;
      throw error;
    }
  }

  const imgDesc = allMessages[0]?.text || imageDescription || "";
  imageDescription = imgDesc;

  const messagesBefore = allMessages.slice(0, messageIndex);
  const firstUser = messagesBefore.find((m) => m.role === "user");
  userFirstMsg = firstUser?.text || null;

  conversationHistory = messagesBefore.map((m) => ({
    role: m.role === "user" ? "User" : "Assistant",
    content: m.text,
  }));

  if (conversationHistory.length > 6) {
    conversationHistory = conversationHistory.slice(-6);
  }

  const lastUserMsg = [...messagesBefore]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMsg) {
    throw new Error("No user message found before the retried message");
  }

  const isFirstTurnWithImage = !firstUser && storedImagePath;

  const channelId = `gemini-stream-${Date.now()}`;
  currentChannelId = channelId;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    if (generationId !== myGenId) return;
    fullResponse += event.payload.token;
    onToken?.(event.payload.token);
  });
  currentUnlisten = unlisten;

  try {
    await invoke("stream_gemini_chat_v2", {
      apiKey: storedApiKey,
      model: currentModelId,
      isInitialTurn: false,
      imageBase64: null,
      imageMimeType: null,
      imagePath: isFirstTurnWithImage ? storedImagePath : null,
      imageDescription: imgDesc,
      userFirstMsg: userFirstMsg,
      historyLog: formatHistoryLog(),
      userMessage: lastUserMsg.text,
      channelId,
    });

    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;

    if (generationId !== myGenId) throw new Error("CANCELLED");

    addToHistory("Assistant", fullResponse);

    return fullResponse;
  } catch (error) {
    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;
    throw error;
  }
};

export const editUserMessage = async (
  messageIndex: number,
  newText: string,
  allMessages: Array<{ role: string; text: string }>,
  modelId: string,
  onToken?: (token: string) => void,
  fallbackImagePath?: string,
): Promise<string> => {
  if (!storedApiKey) throw new Error("Gemini API Key not set");

  currentModelId = modelId;
  const myGenId = generationId;

  if (!storedImagePath && fallbackImagePath) {
    storedImagePath = fallbackImagePath;
  }

  const messagesBefore = allMessages.slice(0, messageIndex);

  const imgDesc =
    messagesBefore.find((m) => m.role === "model")?.text ||
    imageDescription ||
    "";
  imageDescription = imgDesc;

  const previousUserMsg = messagesBefore.find((m) => m.role === "user");

  if (!previousUserMsg) {
    userFirstMsg = newText;
  } else {
    userFirstMsg = messagesBefore.find((m) => m.role === "user")?.text || null;
  }

  conversationHistory = messagesBefore.map((m) => ({
    role: m.role === "user" ? "User" : "Assistant",
    content: m.text,
  }));

  if (conversationHistory.length > 6) {
    conversationHistory = conversationHistory.slice(-6);
  }

  const isFirstTurnWithImage = !previousUserMsg && storedImagePath;

  const channelId = `gemini-stream-${Date.now()}`;
  currentChannelId = channelId;
  let fullResponse = "";

  const unlisten = await listen<GeminiEvent>(channelId, (event) => {
    if (generationId !== myGenId) return;
    fullResponse += event.payload.token;
    onToken?.(event.payload.token);
  });
  currentUnlisten = unlisten;

  try {
    await invoke("stream_gemini_chat_v2", {
      apiKey: storedApiKey,
      model: currentModelId,
      isInitialTurn: false,
      imageBase64: null,
      imageMimeType: null,
      imagePath: isFirstTurnWithImage ? storedImagePath : null,
      imageDescription: imgDesc,
      userFirstMsg: userFirstMsg,
      historyLog: formatHistoryLog(),
      userMessage: newText,
      channelId,
    });

    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;

    if (generationId !== myGenId) throw new Error("CANCELLED");

    addToHistory("User", newText);
    addToHistory("Assistant", fullResponse);

    return fullResponse;
  } catch (error) {
    unlisten();
    if (currentUnlisten === unlisten) currentUnlisten = null;
    throw error;
  }
};

export const restoreSession = (
  modelId: string,
  savedImageDescription: string,
  savedUserFirstMsg: string | null,
  savedHistory: Array<{ role: string; content: string }>,
  savedImagePath: string | null,
) => {
  currentModelId = modelId;
  imageDescription = savedImageDescription;
  userFirstMsg = savedUserFirstMsg;
  conversationHistory = savedHistory.slice(-6);
  storedImagePath = savedImagePath;
};

export const getSessionState = () => ({
  imageDescription,
  userFirstMsg,
  conversationHistory: [...conversationHistory],
});

export const startNewChat = async (
  modelId: string,
  imagePath: string,
): Promise<string> => {
  let fullText = "";
  await startNewChatStream(modelId, imagePath, (token) => {
    fullText += token;
  });
  return fullText;
};
