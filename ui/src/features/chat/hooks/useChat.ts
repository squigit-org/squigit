/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Message, ModelType } from "../types/chat.types";
import { systemPrompt } from "../../../lib/config/prompts";
import {
  startNewChatStream,
  sendMessage,
} from "../../../lib/api/gemini/client";

export const useChatEngine = ({
  apiKey,
  currentModel,
  startupImage,
  prompt,
  setCurrentModel,
  enabled,
  onMessage,
  chatId,
}: {
  apiKey: string;
  currentModel: string;
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    fromHistory?: boolean;
  } | null;
  prompt: string;
  setCurrentModel: (model: string) => void;
  enabled: boolean;
  onMessage?: (message: Message, chatId: string) => void;
  chatId: string | null;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [firstResponseId, setFirstResponseId] = useState<string | null>(null);
  const [lastSentMessage, setLastSentMessage] = useState<Message | null>(null);
  const clearError = () => setError(null);

  // Capture the chatId when the session starts to use it in callbacks
  // This prevents race conditions if the user switches chats during generation
  const sessionChatIdRef = useState(chatId)[0];

  useEffect(() => {
    if (enabled) setIsLoading(true);
  }, [enabled]);

  useEffect(() => {
    if (enabled && startupImage && prompt && apiKey && !startupImage.fromHistory) {
      startSession(apiKey, currentModel, startupImage);
    }
  }, [apiKey, prompt, startupImage, currentModel, enabled]);

  const resetInitialUi = () => {
    setStreamingText("");
    setIsChatMode(false);
  };

  const startSession = async (
    key: string,
    modelId: string,
    imgData: {
      base64: string;
      mimeType: string;
      isFilePath?: boolean;
    } | null,
    isRetry = false
  ) => {
    setIsLoading(true);
    setError(null);
    const targetChatId = chatId;

    if (!key) {
      return;
    }

    if (!isRetry) {
      resetInitialUi();
      setMessages([]);
      setFirstResponseId(null);
      setLastSentMessage(null);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    if (!imgData || !prompt) {
      setIsLoading(false);
      return;
    }

    setIsStreaming(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

      const combinedPrompt = `<sys-prmp>\n${systemPrompt}\n</sys-prmp>\nMSS: ${prompt}`;

      let finalBase64 = imgData.base64;
      if (imgData.isFilePath) {
        try {
          const res = await fetch(imgData.base64);
          const blob = await res.blob();
          finalBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to fetch asset for Gemini", e);
          throw new Error("Failed to load image file.");
        }
      }

      await startNewChatStream(
        modelId,
        finalBase64,
        imgData.mimeType,
        combinedPrompt,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse);
        }
      );
      
      if (onMessage && targetChatId) {
        onMessage({
          id: responseId,
          role: "model",
          text: fullResponse,
          timestamp: Date.now(),
        }, targetChatId);
      }

      setIsStreaming(false);
      setIsLoading(false);
    } catch (apiError: any) {
      console.error(apiError);
      if (
        !isRetry &&
        (apiError.message?.includes("429") || apiError.message?.includes("503"))
      ) {
        console.log("Model failed, trying lite version...");
        setCurrentModel(ModelType.GEMINI_FLASH_LITE);
        return;
      }
      let errorMsg = "Failed to connect to Gemini.";
      if (apiError.message?.includes("429"))
        errorMsg = "Quota limit reached or server busy.";
      else if (apiError.message?.includes("503"))
        errorMsg = "Service temporarily unavailable.";
      else if (apiError.message) errorMsg = apiError.message;

      setError(errorMsg);
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const handleReload = () => {
    if (apiKey && startupImage && prompt) {
      startSession(apiKey, currentModel, startupImage, false);
    } else if (!apiKey) {
      setError("API Key missing. Please reset in settings.");
      setIsLoading(false);
    }
  };

  const handleDescribeEdits = async (editDescription: string) => {
    if (!apiKey || !startupImage || !prompt) {
      setError("Cannot start session. Missing required data.");
      return;
    }
    const targetChatId = chatId;

    // Combine prompt with edit description
    const combinedPrompt = `${prompt}\n\n[User Edit Request]: ${editDescription}`;

    setIsLoading(true);
    setError(null);
    resetInitialUi();
    setMessages([]);
    setFirstResponseId(null);
    setLastSentMessage(null);

    setIsStreaming(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

      const fullPrompt = `<sys-prmp>\n${systemPrompt}\n</sys-prmp>\nMSS: ${combinedPrompt}`;

      let finalBase64 = startupImage.base64;
      if (startupImage.isFilePath) {
        try {
          const res = await fetch(startupImage.base64);
          const blob = await res.blob();
          finalBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to fetch asset for Gemini", e);
          throw new Error("Failed to load image file.");
        }
      }

      await startNewChatStream(
        currentModel,
        finalBase64,
        startupImage.mimeType,
        fullPrompt,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse);
        }
      );
      
      if (onMessage && targetChatId) {
        onMessage({
          id: responseId,
          role: "model",
          text: fullResponse,
          timestamp: Date.now(),
        }, targetChatId);
      }

      setIsStreaming(false);
      setIsLoading(false);
    } catch (apiError: any) {
      console.error(apiError);
      let errorMsg = "Failed to connect to Gemini.";
      if (apiError.message?.includes("429"))
        errorMsg = "Quota limit reached or server busy.";
      else if (apiError.message?.includes("503"))
        errorMsg = "Service temporarily unavailable.";
      else if (apiError.message) errorMsg = apiError.message;

      setError(errorMsg);
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const handleRetrySend = async () => {
    if (!lastSentMessage) return;
    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, lastSentMessage]);
    const targetChatId = chatId;

    try {
      const responseText = await sendMessage(lastSentMessage.text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
      if (onMessage && targetChatId) onMessage(botMsg, targetChatId);
      setLastSentMessage(null);
    } catch (apiError: any) {
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (userText: string) => {
    if (!userText.trim() || isLoading) return;
    const targetChatId = chatId;

    if (!isChatMode) {
      setIsChatMode(true);
      if (streamingText && firstResponseId) {
        const botMsg: Message = {
          id: firstResponseId,
          role: "model",
          text: streamingText,
          timestamp: Date.now(),
        };
        setMessages([botMsg]);
        setStreamingText("");
        setFirstResponseId(null);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: userText,
      timestamp: Date.now(),
    };

    setLastSentMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);
    if (onMessage && targetChatId) onMessage(userMsg, targetChatId);
    setIsLoading(true);
    setError(null);

    try {
      const responseText = await sendMessage(userText);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
      if (onMessage && targetChatId) onMessage(botMsg, targetChatId);
      setLastSentMessage(null);
    } catch (apiError: any) {
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // Get current state for saving to session
  const getCurrentState = () => ({
    messages,
    streamingText,
    firstResponseId,
    isChatMode,
  });

  // Restore state from a session
  const restoreState = (state: {
    messages: Message[];
    streamingText: string;
    firstResponseId: string | null;
    isChatMode: boolean;
  }) => {
    setMessages(state.messages);
    setStreamingText(state.streamingText);
    setFirstResponseId(state.firstResponseId);
    setIsChatMode(state.isChatMode);
    setIsLoading(false);
    setIsStreaming(false);
  };

  return {
    messages,
    isLoading,
    error,
    clearError,
    isChatMode,
    isStreaming,
    streamingText,
    lastSentMessage,
    handleSend,
    handleRetrySend,
    handleReload,
    handleDescribeEdits,
    startSession,
    getCurrentState,
    restoreState,
  };
};
