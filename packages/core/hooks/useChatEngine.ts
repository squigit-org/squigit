/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Message, ModelType } from "../types";
import { startNewChatStream, sendMessage } from "../services/geminiService";
import systemPromptYaml from "../services/prompt.yml?raw";

export const useChatEngine = ({
  apiKey,
  currentModel,
  startupImage,
  prompt,
  setCurrentModel,
}: {
  apiKey: string;
  currentModel: string;
  startupImage: { base64: string; mimeType: string } | null;
  prompt: string;
  setCurrentModel: (model: string) => void;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [firstResponseId, setFirstResponseId] = useState<string | null>(null);
  const [lastSentMessage, setLastSentMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (apiKey && prompt && startupImage) {
      startSession(apiKey, currentModel, startupImage);
    }
  }, [apiKey, prompt, startupImage, currentModel]);

  const resetInitialUi = () => {
    setStreamingText("");
    setIsChatMode(false);
  };

  const startSession = async (
    key: string,
    modelId: string,
    imgData: { base64: string; mimeType: string } | null,
    isRetry = false
  ) => {
    if (!key || !imgData || !prompt) return;

    if (!isRetry) {
      resetInitialUi();
      setMessages([]);
      setIsLoading(true);
      setError(null);
      setFirstResponseId(null);
      setLastSentMessage(null);
    }

    setIsStreaming(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

      const combinedPrompt = `<sys-prmp>\n${systemPromptYaml}\n</sys-prmp>\nMSS: ${prompt}`;

      await startNewChatStream(
        modelId,
        imgData.base64,
        imgData.mimeType,
        combinedPrompt,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse);
        }
      );
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

  const handleRetrySend = async () => {
    if (!lastSentMessage) return;
    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, lastSentMessage]);

    try {
      const responseText = await sendMessage(lastSentMessage.text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
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
      setLastSentMessage(null);
    } catch (apiError: any) {
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    error,
    isChatMode,
    isStreaming,
    streamingText,
    lastSentMessage,
    handleSend,
    handleRetrySend,
    startSession,
  };
};
