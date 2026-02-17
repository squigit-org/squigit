/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Message } from "@/features/chat";
import { ModelType } from "@/lib/config";
import {
  startNewChatStream,
  startNewChatSync,
  sendMessage,
  restoreSession as apiRestoreSession,
  retryFromMessage,
  editUserMessage,
  cancelCurrentRequest,
} from "@/lib/api/gemini";

export const useChat = ({
  apiKey,
  currentModel,
  startupImage,
  prompt,
  setCurrentModel,
  enabled,
  onMessage,
  onOverwriteMessages,
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
  onOverwriteMessages?: (messages: Message[]) => void;
  chatId: string | null;
  onMissingApiKey?: () => void;
  onTitleGenerated?: (title: string) => void;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(
    null,
  );
  const [firstResponseId, setFirstResponseId] = useState<string | null>(null);
  const [lastSentMessage, setLastSentMessage] = useState<Message | null>(null);
  const clearError = () => setError(null);

  const sessionChatIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const preRetryMessagesRef = useRef<Message[]>([]);

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
    if (
      enabled &&
      startupImage &&
      prompt &&
      !startupImage.fromHistory &&
      chatId
    ) {
      const imageKey = startupImage.base64?.substring(0, 50) ?? chatId;
      if (sessionStartedForImageRef.current === imageKey) {
        return;
      }

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

  useEffect(() => {
    if (chatId === null) {
      setMessages([]);
      setStreamingText("");
      setFirstResponseId(null);
      setLastSentMessage(null);
      setError(null);
      sessionStartedForImageRef.current = null;
    }
  }, [chatId]);

  const resetInitialUi = () => {
    setStreamingText("");
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

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
    setIsAiTyping(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

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

      if (!isRetry && imgData && !imgData.fromHistory) {
        const { title, content } = await startNewChatSync(
          key,
          modelId,
          finalBase64,
          imgData.mimeType,
        );

        if (signal.aborted) return;

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

        const targetChatId = sessionChatIdRef.current;
        if (onMessage && targetChatId) {
          onMessage(botMsg, targetChatId);
        }

        setIsLoading(false);
        setIsStreaming(false);
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
      if (signal.aborted || apiError?.message === "CANCELLED") {
        setIsLoading(false);
        setIsAiTyping(false);
        return;
      }

      console.error(apiError);
      if (
        !isRetry &&
        (apiError.message?.includes("429") || apiError.message?.includes("503"))
      ) {
        if (currentModel !== ModelType.GEMINI_FLASH_LITE) {
          console.log("Model failed, trying lite version...");
          setCurrentModel(ModelType.GEMINI_FLASH_LITE);
          return;
        }
      }

      setIsAiTyping(false);
      cancelCurrentRequest();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
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

  const handleDescribeEdits = async (_editDescription: string) => {
    if (!apiKey || !startupImage || !prompt) {
      if (!apiKey && onMissingApiKey) {
        onMissingApiKey();
        return;
      }
      setError("Cannot start session. Missing required data.");
      return;
    }
    const targetChatId = chatId;

    setIsLoading(true);
    setError(null);
    resetInitialUi();
    setMessages([]);
    setFirstResponseId(null);
    setLastSentMessage(null);

    setIsStreaming(true);
    setIsAiTyping(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

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
      if (apiError?.message === "CANCELLED") {
        setIsAiTyping(false);
        return;
      }
      console.error(apiError);
      let errorMsg = "Failed to connect to Gemini.";
      if (apiError.message?.includes("429"))
        errorMsg = "Quota limit reached or server busy.";
      else if (apiError.message?.includes("503"))
        errorMsg = "Service temporarily unavailable.";
      else if (apiError.message) errorMsg = apiError.message;

      setError(errorMsg);
      setIsStreaming(false);
      setIsAiTyping(false);
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
      setIsAiTyping(true);
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
      if (apiError?.message === "CANCELLED") {
        setIsAiTyping(false);
        return;
      }
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
      setIsAiTyping(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (userText: string, modelId?: string) => {
    if (!userText.trim() || isLoading) return;
    const targetChatId = chatId;

    if (streamingText && firstResponseId) {
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

      if (isStreaming && onMessage && targetChatId) {
        onMessage(botMsg, targetChatId);
      }

      setStreamingText("");
      setFirstResponseId(null);
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
      setIsAiTyping(true);
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
      if (apiError?.message === "CANCELLED") {
        setIsAiTyping(false);
        return;
      }
      setError("Failed to send message. " + (apiError.message || ""));
      setMessages((prev) => prev.slice(0, -1));
      setIsAiTyping(false);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentState = () => ({
    messages,
    streamingText,
    firstResponseId,
  });

  const restoreState = async (
    state: {
      messages: Message[];
      streamingText: string;
      firstResponseId: string | null;
    },
    image?: { base64: string; mimeType: string; isFilePath?: boolean },
  ) => {
    setMessages(state.messages);
    setStreamingText(state.streamingText);
    setFirstResponseId(state.firstResponseId);
    setIsLoading(false);
    setIsStreaming(false);

    if (state.messages.length > 0) {
      try {
        const firstMsg = state.messages[0];
        const savedHistory = state.messages.map((m) => ({
          role: m.role === "model" ? "Assistant" : "User",
          content: m.text,
        }));

        const firstUserMsg = state.messages.find((m) => m.role === "user");

        let imageBase64 = null;
        let imageMimeType = null;

        if (image) {
          if (image.isFilePath) {
            try {
              const raw = (await invoke("read_file_base64", {
                path: image.base64,
              })) as string;
              imageBase64 = raw;
              imageMimeType = image.mimeType;
            } catch (e) {
              console.error("Failed to read image file for restore:", e);
            }
          } else {
            imageBase64 = image.base64;
            imageMimeType = image.mimeType;
          }
        }

        apiRestoreSession(
          currentModel,
          firstMsg.text,
          firstUserMsg?.text || null,
          savedHistory,
          imageBase64,
          imageMimeType,
        );
      } catch (e) {
        console.error("Failed to restore Gemini session:", e);
      }
    }
  };

  const handleStreamComplete = () => {
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
    setIsAiTyping(false);
  };

  const handleStopGeneration = (truncatedText?: string) => {
    if (truncatedText !== undefined) {
      if (streamingText && firstResponseId) {
        const botMsg: Message = {
          id: firstResponseId,
          role: "model",
          text: truncatedText,
          timestamp: Date.now(),
        };
        setMessages([botMsg]);
        setStreamingText("");
        setFirstResponseId(null);
        setIsAiTyping(false);

        const targetChatId = sessionChatIdRef.current;
        if (onMessage && targetChatId) {
          onMessage(botMsg, targetChatId);
        }
        return;
      }

      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === "model") {
            updated[i] = { ...updated[i], text: truncatedText };
            break;
          }
        }

        onOverwriteMessages?.(updated);
        return updated;
      });
      setIsAiTyping(false);
      return;
    }

    if (retryingMessageId) {
      cancelCurrentRequest();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const oldMessages = preRetryMessagesRef.current;
      setMessages(oldMessages);
      onOverwriteMessages?.(oldMessages);
      setRetryingMessageId(null);
      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
      setStreamingText("");
      setFirstResponseId(null);
      return;
    }

    cancelCurrentRequest();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const stoppedMsg: Message = {
      id: Date.now().toString(),
      role: "model",
      text: "You stopped this response.",
      timestamp: Date.now(),
      stopped: true,
    };
    setMessages((prev) => [...prev, stoppedMsg]);
    const targetChatId = sessionChatIdRef.current;
    if (onMessage && targetChatId) {
      onMessage(stoppedMsg, targetChatId);
    }

    setIsLoading(false);
    setIsStreaming(false);
    setIsAiTyping(false);
    setStreamingText("");
    setFirstResponseId(null);
  };

  const handleRetryMessage = async (messageId: string, modelId?: string) => {
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const truncatedMessages = messages.slice(0, msgIndex);
    const retryModelId = modelId || currentModel;

    preRetryMessagesRef.current = [...messages];
    setRetryingMessageId(messageId);
    setError(null);

    let hasStartedStreaming = false;

    const newResponseId = Date.now().toString();

    let fallbackImage: { base64: string; mimeType: string } | undefined;
    if (startupImage) {
      try {
        let base64Data = startupImage.base64;
        if (startupImage.isFilePath) {
          const res = await fetch(startupImage.base64);
          const blob = await res.blob();
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
        fallbackImage = {
          base64: base64Data,
          mimeType: startupImage.mimeType,
        };
      } catch (e) {
        console.error("Failed to load fallback image for retry:", e);
      }
    }

    try {
      const responseText = await retryFromMessage(
        msgIndex,
        messages,
        retryModelId,
        (token) => {
          if (!hasStartedStreaming) {
            hasStartedStreaming = true;

            setRetryingMessageId(null);
            setMessages(truncatedMessages);
            setIsStreaming(true);
            setIsAiTyping(true);
            setFirstResponseId(newResponseId);
            setStreamingText(token);
          } else {
            setStreamingText((prev) => prev + token);
          }
        },
        fallbackImage,
      );

      const botMsg: Message = {
        id: newResponseId,
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };

      if (!hasStartedStreaming) {
        setMessages(truncatedMessages);
        setRetryingMessageId(null);
      }

      const newMessages = [...truncatedMessages, botMsg];
      setMessages(newMessages);
      setIsAiTyping(false);
      setStreamingText("");
      setFirstResponseId(null);
      setRetryingMessageId(null);

      onOverwriteMessages?.(newMessages);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED") {
        setIsAiTyping(false);
        return;
      }
      console.error("Retry failed:", apiError);
      setError("Failed to regenerate response. " + (apiError.message || ""));

      setRetryingMessageId(null);
      setIsAiTyping(false);
      setRetryingMessageId(null);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setRetryingMessageId(null);
    }
  };

  const handleEditMessage = async (
    messageId: string,
    newText: string,
    modelId?: string,
  ) => {
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const truncatedMessages = messages.slice(0, msgIndex);
    const retryModelId = modelId || currentModel;

    preRetryMessagesRef.current = [...messages];
    const editedUserMsg: Message = {
      ...messages[msgIndex],
      text: newText,
    };
    setMessages([...truncatedMessages, editedUserMsg]);
    setIsLoading(true);

    setError(null);
    let hasStartedStreaming = false;
    const newResponseId = Date.now().toString();

    let fallbackImage: { base64: string; mimeType: string } | undefined;
    if (startupImage) {
      try {
        let base64Data = startupImage.base64;
        if (startupImage.isFilePath) {
          const res = await fetch(startupImage.base64);
          const blob = await res.blob();
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
        fallbackImage = {
          base64: base64Data,
          mimeType: startupImage.mimeType,
        };
      } catch (e) {
        console.error("Failed to load fallback image for edit:", e);
      }
    }

    try {
      const responseText = await editUserMessage(
        msgIndex,
        newText,
        messages,
        retryModelId,
        (token) => {
          if (!hasStartedStreaming) {
            hasStartedStreaming = true;
            setIsStreaming(true);
            setIsAiTyping(true);
            setFirstResponseId(newResponseId);
            setStreamingText(token);
          } else {
            setStreamingText((prev) => prev + token);
          }
        },
        fallbackImage,
      );

      const botMsg: Message = {
        id: newResponseId,
        role: "model",
        text: responseText,
        timestamp: Date.now(),
      };

      setMessages([...truncatedMessages, editedUserMsg, botMsg]);
      setIsAiTyping(false);
      setStreamingText("");
      setFirstResponseId(null);

      onOverwriteMessages?.([...truncatedMessages, editedUserMsg, botMsg]);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED") {
        setIsAiTyping(false);
        return;
      }
      console.error("Edit failed:", apiError);
      setError("Failed to edit message. " + (apiError.message || ""));
      setRetryingMessageId(null);
      setIsLoading(false);
      setIsAiTyping(false);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  return {
    messages,
    isLoading,
    error,
    clearError,
    isStreaming,
    isAiTyping,
    setIsAiTyping,
    retryingMessageId,
    streamingText,
    lastSentMessage,
    isAnalyzing:
      (!!startupImage &&
        isLoading &&
        !streamingText &&
        messages.length === 0) ||
      (!!startupImage &&
        !!retryingMessageId &&
        messages.findIndex((m) => m.id === retryingMessageId) === 0),
    isGenerating: (isLoading || !!retryingMessageId) && messages.length > 0,
    handleSend,
    handleRetrySend,
    handleRetryMessage,
    handleEditMessage,
    handleDescribeEdits,
    handleStreamComplete,
    handleStopGeneration,
    startSession,
    getCurrentState,
    restoreState,
  };
};
