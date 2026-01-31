/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Message, ModelType } from "../types/chat.types";
import { systemPrompt } from "../../../lib/config/prompts";
import {
  startNewChatStream,
  sendMessage,
  restoreSession as apiRestoreSession,
} from "../../../lib/api/gemini/client";

export const useChat = ({
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
  const sessionChatIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (enabled && !startupImage?.fromHistory) {
      setIsLoading(true);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [enabled, startupImage?.fromHistory]);

  useEffect(() => {
    // Only start if we have a valid chatId to attach the session to
    if (
      enabled &&
      startupImage &&
      prompt &&
      apiKey &&
      !startupImage.fromHistory &&
      chatId
    ) {
      startSession(apiKey, currentModel, startupImage);
    }
  }, [apiKey, prompt, startupImage, currentModel, enabled, chatId]);

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
    isRetry = false,
  ) => {
    // Cancel any previous session
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Capture the current chat ID at start of session
    sessionChatIdRef.current = chatId;

    setIsLoading(true);
    setError(null);

    if (!key) {
      return;
    }

    if (!isRetry) {
      resetInitialUi();
      setMessages([]);
      setFirstResponseId(null);
      setLastSentMessage(null);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (signal.aborted) {
        setIsLoading(false);
        return;
      }
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

      if (signal.aborted) {
        setIsLoading(false);
        return;
      }

      await startNewChatStream(
        modelId,
        finalBase64,
        imgData.mimeType,
        combinedPrompt,
        (token: string) => {
          if (signal.aborted) return;
          fullResponse += token;
          setStreamingText(fullResponse);
        },
      );

      if (signal.aborted) {
        setIsLoading(false);
        return;
      }

      // Use the captured chatId, not the current state one
      const targetChatId = sessionChatIdRef.current;

      if (onMessage && targetChatId) {
        onMessage(
          {
            id: responseId,
            role: "model",
            text: fullResponse,
            timestamp: Date.now(),
          },
          targetChatId,
        );
      }

      setIsStreaming(false);
      setIsLoading(false);
    } catch (apiError: any) {
      if (signal.aborted) {
        setIsLoading(false);
        return;
      }

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
    } finally {
      if (abortControllerRef.current?.signal === signal) {
        abortControllerRef.current = null;
      }
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
        },
      );

      if (onMessage && targetChatId) {
        onMessage(
          {
            id: responseId,
            role: "model",
            text: fullResponse,
            timestamp: Date.now(),
          },
          targetChatId,
        );
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
        // Abort the background stream effectively "claiming" the response as is
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        const botMsg: Message = {
          id: firstResponseId,
          role: "model",
          text: streamingText,
          timestamp: Date.now(),
        };
        setMessages([botMsg]);

        // Persist the initial message immediately ONLY if we are interrupting the stream.
        // If streaming finished naturally (!isStreaming), it was already saved by startSession.
        if (isStreaming && onMessage && targetChatId) {
          onMessage(botMsg, targetChatId);
        }

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
  const restoreState = async (
    state: {
      messages: Message[];
      streamingText: string;
      firstResponseId: string | null;
      isChatMode: boolean;
    },
    image?: { base64: string; mimeType: string },
  ) => {
    setMessages(state.messages);
    setStreamingText(state.streamingText);
    setFirstResponseId(state.firstResponseId);
    setIsChatMode(state.isChatMode);
    setIsLoading(false);
    setIsStreaming(false);

    // If image provided, initialize the Gemini session with history
    if (image) {
      // OPTIMIZATION: If messages exist, use a lightweight context summary (First + Last message)
      // This avoids re-sending the heavy image data, saving tokens and bandwidth.
      if (state.messages.length > 0) {
        try {
          const history: any[] = [];
          const firstMsg = state.messages[0];
          const lastMsg = state.messages[state.messages.length - 1];

          const contextPrompt = `[System]: Resuming chat session.
To save resources, the original image is NOT re-sent.
Here is the context from the conversation history:

---
**Initial AI Analysis (First Message):**
${firstMsg.text}

---
**Most Recent Message:**
${lastMsg.role === "user" ? "User" : "AI"}: ${lastMsg.text}

---
Please continue the conversation focusing on the User's next prompt, using the above context.`;

          history.push({
            role: "user",
            parts: [{ text: contextPrompt }],
          });

          // Add a placeholder acknowledgment to set the turn
          history.push({
            role: "model",
            parts: [
              {
                text: "Understood. I have the context and am ready for the new prompt.",
              },
            ],
          });

          // Initialize session with this lightweight history
          apiRestoreSession(currentModel, history, systemPrompt);
        } catch (e) {
          console.error("Failed to restore Gemini session (optimized):", e);
        }
      } else {
        // FALLBACK: If no messages (empty chat), we must send the image to start the analysis.
        try {
          let finalBase64 = image.base64;

          if (
            image.base64.startsWith("asset://") ||
            image.base64.startsWith("http")
          ) {
            try {
              const res = await fetch(image.base64);
              const blob = await res.blob();
              finalBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              console.error("Failed to fetch asset for restore", e);
              return;
            }
          }

          const history: any[] = [];
          const cleanBase64 = finalBase64.replace(
            /^data:image\/[a-z]+;base64,/,
            "",
          );

          history.push({
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: systemPrompt,
              },
              {
                text: prompt || "Analyze this image.",
              },
            ],
          });

          apiRestoreSession(currentModel, history, systemPrompt);
        } catch (e) {
          console.error("Failed to restore Gemini session (fallback):", e);
        }
      }
    }
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
