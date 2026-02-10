/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Message, ModelType } from "@/features/chat";
import {
  startNewChatStream,
  startNewChatSync,
  sendMessage,
  restoreSession as apiRestoreSession,
  resetBrainContext,
  getSessionState,
} from "@/lib/api/gemini/client";

export const useChat = ({
  apiKey,
  currentModel,
  startupImage,
  prompt,
  setCurrentModel,
  enabled,
  onMessage,
  chatId,
  onMissingApiKey,
  onTitleGenerated,
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
  onMissingApiKey?: () => void;
  onTitleGenerated?: (title: string) => void;
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
  // Track if session has been started for current startupImage to prevent re-trigger loops
  const sessionStartedForImageRef = useRef<string | null>(null);

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
      !startupImage.fromHistory &&
      chatId
    ) {
      // Guard: don't re-start session if one has already been started for this image
      // This prevents re-trigger loops when currentModel changes (e.g., fallback on 429)
      const imageKey = startupImage.base64?.substring(0, 50) ?? chatId;
      if (sessionStartedForImageRef.current === imageKey) {
        return;
      }

      // Guard: If we already have messages (e.g. from a draft or previous state), don't wipe them on key change
      if (messages.length > 0) {
        return;
      }

      sessionStartedForImageRef.current = imageKey;

      if (apiKey) {
        startSession(apiKey, currentModel, startupImage);
      } else {
        if (onMissingApiKey) onMissingApiKey();
        setIsLoading(false);
      }
    }
  }, [
    apiKey,
    prompt,
    startupImage,
    currentModel,
    enabled,
    chatId,
    messages.length,
  ]);

  // Clear state when switching sessions (chatId becomes null)
  useEffect(() => {
    if (chatId === null) {
      setMessages([]);
      setStreamingText("");
      setIsChatMode(false);
      setFirstResponseId(null);
      setLastSentMessage(null);
      setError(null);
      sessionStartedForImageRef.current = null;
    }
  }, [chatId]);

  const resetInitialUi = () => {
    setStreamingText("");
    setIsChatMode(false);
    sessionStartedForImageRef.current = null;
  };

  const startSession = async (
    key: string,
    modelId: string,
    imgData: {
      base64: string;
      mimeType: string;
      isFilePath?: boolean;
      fromHistory?: boolean;
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
      if (onMissingApiKey) onMissingApiKey();
      setIsLoading(false);
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

      // Brain v2: No more sys-prmp wrapping - backend handles prompts
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

      // Sync Flow for Initial Turn (New Chat with Image)
      // This allows us to generate title sequentially on backend to avoid quota issues
      if (!isRetry && imgData && !imgData.fromHistory) {
        // Use sync command
        const { title, content } = await startNewChatSync(
          key,
          modelId,
          finalBase64,
          imgData.mimeType,
        );

        if (signal.aborted) return;

        // Callback for title
        if (onTitleGenerated) {
          onTitleGenerated(title);
        }

        const botMsg: Message = {
          id: responseId,
          role: "model",
          text: content,
          timestamp: Date.now(),
        };

        setMessages([botMsg]);

        // Notify shell
        const targetChatId = sessionChatIdRef.current;
        if (onMessage && targetChatId) {
          onMessage(botMsg, targetChatId);
        }

        setIsLoading(false);
        setIsStreaming(false); // No streaming for sync
        return;
      }

      await startNewChatStream(
        modelId,
        finalBase64,
        imgData.mimeType,
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
      if (onMissingApiKey) {
        onMissingApiKey();
        setIsLoading(false);
      } else {
        setError("API Key missing. Please reset in settings.");
        setIsLoading(false);
      }
    }
  };

  const handleDescribeEdits = async (editDescription: string) => {
    if (!apiKey || !startupImage || !prompt) {
      if (!apiKey && onMissingApiKey) {
        onMissingApiKey();
        return;
      }
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

      // Brain v2: Backend handles prompts
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

  const handleSend = async (userText: string, modelId?: string) => {
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
      const responseText = await sendMessage(userText, modelId);
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

    // Brain v2: Restore session using new context-based API
    if (state.messages.length > 0) {
      try {
        const firstMsg = state.messages[0];
        const savedHistory = state.messages.map((m) => ({
          role: m.role === "model" ? "Assistant" : "User",
          content: m.text,
        }));

        // Find user's first message for intent anchoring
        const firstUserMsg = state.messages.find((m) => m.role === "user");

        apiRestoreSession(
          currentModel,
          firstMsg.text, // Image description = AI's first response
          firstUserMsg?.text || null,
          savedHistory,
        );
      } catch (e) {
        console.error("Failed to restore Gemini session:", e);
      }
    }
  };

  // Handle stream animation completion - auto-transition to chat mode
  const handleStreamComplete = () => {
    if (streamingText && firstResponseId && !isChatMode) {
      const botMsg: Message = {
        id: firstResponseId,
        role: "model",
        text: streamingText,
        timestamp: Date.now(),
      };
      setMessages([botMsg]);
      setStreamingText("");
      setFirstResponseId(null);
      setIsChatMode(true);
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
    handleStreamComplete,
    startSession,
    getCurrentState,
    restoreState,
  };
};
