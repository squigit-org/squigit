/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from "react";
import { Message } from "@/features";
import {
  startNewThreadStream,
  sendMessage as apiSendMessage,
  retryFromMessage as apiRetryFromMessage,
  cancelCurrentRequest,
  replaceLastAssistantHistory,
  restoreSession as apiRestoreSession,
  getImageDescription,
  setImageDescription,
  ModelType,
} from "@/lib";

export const useGeminiEngine = (config: {
  apiKey: string;
  currentModel: string;
  setCurrentModel: (model: string) => void;
  chatId: string | null;
  chatTitle: string;
  startupImage: { path: string; mimeType: string; imageId: string } | null;
  onMissingApiKey?: () => void;
  onMessage?: (message: Message, chatId: string) => void;
  onOverwriteMessages?: (messages: Message[]) => void;
  onTitleGenerated?: (title: string) => void;
  generateTitle?: (text: string) => Promise<string>;
  state: any; // from useChatState
  userName?: string;
  userEmail?: string;
  userInstruction?: string;
}) => {
  const {
    messages,
    setMessages,
    setIsLoading,
    setIsStreaming,
    setIsAiTyping,
    setStreamingText,
    setFirstResponseId,
    setRetryingMessageId,
    setLastSentMessage,
    resetInitialUi,
    appendErrorMessage,
    streamingText,
    firstResponseId,
    lastSentMessage,
  } = config.state;

  const sessionChatIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestCancelledRef = useRef(false);
  const preRetryMessagesRef = useRef<Message[]>([]);

  const cleanupAbortController = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const startSession = async (
    key: string,
    modelId: string,
    imgData: {
      path: string;
      mimeType: string;
      imageId: string;
      fromHistory?: boolean;
    } | null,
    isRetry = false,
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    sessionChatIdRef.current = config.chatId;
    isRequestCancelledRef.current = false;

    setIsLoading(true);

    if (!key) {
      if (config.onMissingApiKey) config.onMissingApiKey();
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

    if (!imgData) {
      setIsLoading(false);
      return;
    }

    setIsStreaming(true);
    setIsAiTyping(true);

    try {
      let fullResponse = "";
      const responseId = Date.now().toString();
      setFirstResponseId(responseId);

      if (signal.aborted) {
        setIsLoading(false);
        return;
      }

      console.log(
        "[useGeminiEngine] Calling startNewThreadStream with model:",
        modelId,
      );
      await startNewThreadStream(
        modelId,
        imgData.path,
        (token: string) => {
          if (signal.aborted) return;
          fullResponse += token;
          setStreamingText(fullResponse);
        },
        config.userName,
        config.userEmail,
        config.userInstruction,
        (brief: string) => {
          if (!isRetry && !imgData.fromHistory && config.generateTitle && config.onTitleGenerated) {
            console.log("[useGeminiEngine] Triggering title generation using image brief");
            config
              .generateTitle(brief)
              .then((title) => {
                console.log("[useGeminiEngine] Title generated:", title);
                if (!signal.aborted) config.onTitleGenerated?.(title);
              })
              .catch(console.error);
          }
        }
      );
      console.log("[useGeminiEngine] startNewThreadStream finished!");

      if (signal.aborted) {
        setIsLoading(false);
        return;
      }

      const botMsg: Message = {
        id: responseId,
        role: "model",
        text: fullResponse,
        timestamp: Date.now(),
        alreadyStreamed: true,
      };
      setMessages((prev: Message[]) => {
        const newMsgs = [...prev, botMsg];
        if (config.onOverwriteMessages) {
          config.onOverwriteMessages(newMsgs);
        }
        return newMsgs;
      });
      setStreamingText("");
      setFirstResponseId(null);

      setIsStreaming(false);
      setIsAiTyping(false);
      setIsLoading(false);
    } catch (apiError: any) {
      if (
        signal.aborted ||
        apiError?.message === "CANCELLED" ||
        isRequestCancelledRef.current
      ) {
        setIsLoading(false);
        setIsStreaming(false);
        setIsAiTyping(false);
        return;
      }

      console.error(apiError);
      if (
        !isRetry &&
        (apiError.message?.includes("429") || apiError.message?.includes("503"))
      ) {
        if (config.currentModel !== ModelType.GEMINI_3_1_FLASH) {
          console.log("Model failed, trying lite version...");
          config.setCurrentModel(ModelType.GEMINI_3_1_FLASH);
          setIsLoading(false);
          setIsStreaming(false);
          setIsAiTyping(false);
          return;
        }
      }

      setIsAiTyping(false);
      cancelCurrentRequest();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      let errorMsg = "An error occurred while connecting to Gemini.";
      if (apiError.message?.includes("429"))
        errorMsg = "Quota limit reached or server busy.";
      else if (apiError.message?.includes("503"))
        errorMsg = "Service temporarily unavailable.";
      else if (apiError.message) errorMsg = apiError.message;

      appendErrorMessage(errorMsg, sessionChatIdRef.current || config.chatId);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
      if (abortControllerRef.current?.signal === signal) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleDescribeEdits = async (_editDescription: string) => {
    if (!config.apiKey || !config.startupImage) {
      if (!config.apiKey && config.onMissingApiKey) {
        config.onMissingApiKey();
        return;
      }
      appendErrorMessage(
        "Cannot start session. Missing required data.",
        config.chatId,
      );
      return;
    }
    const targetChatId = config.chatId;
    isRequestCancelledRef.current = false;

    setIsLoading(true);
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

      await startNewThreadStream(
        config.currentModel,
        config.startupImage.path,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse); // ← LIVE UPDATE
        },
      );

      const botMsg: Message = {
        id: responseId,
        role: "model",
        text: fullResponse,
        timestamp: Date.now(),
        alreadyStreamed: true,
      };
      setMessages((prev: Message[]) => {
        const newMsgs = [...prev, botMsg];
        if (config.onOverwriteMessages) {
          config.onOverwriteMessages(newMsgs);
        }
        return newMsgs;
      });
      setStreamingText("");
      setFirstResponseId(null);

      setIsStreaming(false);
      setIsAiTyping(false);
      setIsLoading(false);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setIsAiTyping(false);
        return;
      }
      console.error(apiError);
      let errorMsg = "An error occurred while connecting to Gemini.";
      if (apiError.message?.includes("429"))
        errorMsg = "Quota limit reached or server busy.";
      else if (apiError.message?.includes("503"))
        errorMsg = "Service temporarily unavailable.";
      else if (apiError.message) errorMsg = apiError.message;

      appendErrorMessage(errorMsg, targetChatId);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
    }
  };

  const handleRetrySend = async () => {
    if (!lastSentMessage) return;
    setIsLoading(true);
    isRequestCancelledRef.current = false;
    setMessages((prev: Message[]) => [...prev, lastSentMessage]);
    const targetChatId = config.chatId;

    try {
      let fullResponse = "";
      const responseId = (Date.now() + 1).toString();
      setIsAiTyping(true);
      setIsStreaming(true);
      setFirstResponseId(responseId);

      const responseText = await apiSendMessage(
        lastSentMessage.text,
        undefined,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse);
        },
        config.chatId,
      );
      const botMsg: Message = {
        id: responseId,
        role: "model",
        text: responseText,
        timestamp: Date.now(),
        alreadyStreamed: true,
      };
      setMessages((prev: Message[]) => {
        const newMsgs = [...prev, botMsg];
        if (config.onOverwriteMessages) {
          config.onOverwriteMessages(newMsgs);
        }
        return newMsgs;
      });
      setLastSentMessage(null);
      setStreamingText("");
      setFirstResponseId(null);
      setIsStreaming(false);
      setIsAiTyping(false);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        setIsStreaming(false);
        setIsAiTyping(false);
        return;
      }
      appendErrorMessage(
        "An error occurred while sending the message. " +
          (apiError.message || ""),
        targetChatId,
      );
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
    }
  };

  const handleSend = async (userText: string, modelId?: string) => {
    if (!userText.trim() || config.state.isLoading) return;
    const targetChatId = config.chatId;

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
      setMessages((prev: Message[]) => {
        const idx = prev.findIndex((m) => m.id === botMsg.id);
        if (idx !== -1) {
          const newMsgs = [...prev];
          newMsgs[idx] = botMsg;
          if (config.onOverwriteMessages) {
            config.onOverwriteMessages(newMsgs);
          }
          return newMsgs;
        }
        const newMsgs = [...prev, botMsg];
        if (config.onOverwriteMessages) {
          config.onOverwriteMessages(newMsgs);
        }
        return newMsgs;
      });

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
    setMessages((prev: Message[]) => [...prev, userMsg]);
    if (config.onMessage && targetChatId)
      config.onMessage(userMsg, targetChatId);
    setIsLoading(true);
    isRequestCancelledRef.current = false;

    try {
      let fullResponse = "";
      const responseId = (Date.now() + 1).toString();
      setIsAiTyping(true);
      setIsStreaming(true);
      setFirstResponseId(responseId);

      const responseText = await apiSendMessage(
        userText,
        modelId,
        (token: string) => {
          fullResponse += token;
          setStreamingText(fullResponse);
        },
        config.chatId,
      );
      const botMsg: Message = {
        id: responseId,
        role: "model",
        text: responseText,
        timestamp: Date.now(),
        alreadyStreamed: true,
      };
      setMessages((prev: Message[]) => {
        const newMsgs = [...prev, botMsg];
        if (config.onOverwriteMessages) {
          config.onOverwriteMessages(newMsgs);
        }
        return newMsgs;
      });
      setLastSentMessage(null);
      setStreamingText("");
      setFirstResponseId(null);
      setIsStreaming(false);
      setIsAiTyping(false);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        setIsStreaming(false);
        setIsAiTyping(false);
        return;
      }
      appendErrorMessage(
        "An error occurred while sending the message. " +
          (apiError.message || ""),
        targetChatId,
      );
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
    }
  };

  const handleRetryMessage = async (messageId: string, modelId?: string) => {
    const msgIndex = messages.findIndex((m: Message) => m.id === messageId);
    if (msgIndex === -1) return;

    const truncatedMessages = messages.slice(0, msgIndex);
    const retryModelId = modelId || config.currentModel;

    preRetryMessagesRef.current = [...messages];
    
    // Immediately truncate messages to avoid full text flash on completion
    setMessages(truncatedMessages);
    if (config.onOverwriteMessages) {
      config.onOverwriteMessages(truncatedMessages);
    }
    
    setRetryingMessageId(messageId); // Keep for "Analyzing" shimmer if needed
    isRequestCancelledRef.current = false;

    const newResponseId = Date.now().toString();

    let fallbackImagePath: string | undefined;
    if (config.startupImage) {
      fallbackImagePath = config.startupImage.path;
    }

    try {
      let fullResponse = "";
      let hasReceivedFirstToken = false;
      setFirstResponseId(newResponseId);
      setIsStreaming(true);
      setIsAiTyping(true);

      const responseText = await apiRetryFromMessage(
        msgIndex,
        messages,
        retryModelId,
        (token: string) => {
          fullResponse += token;
          if (!hasReceivedFirstToken) {
            hasReceivedFirstToken = true;
          }
          setStreamingText(fullResponse);
        },
        fallbackImagePath,
      );

      if (
        msgIndex === 0 &&
        (!config.chatTitle || config.chatTitle === "New thread") &&
        responseText.length > 50 &&
        config.generateTitle &&
        config.onTitleGenerated
      ) {
        config
          .generateTitle(responseText)
          .then((title) => config.onTitleGenerated?.(title))
          .catch(console.error);
      }

      const botMsg: Message = {
        id: newResponseId,
        role: "model",
        text: responseText,
        timestamp: Date.now(),
        alreadyStreamed: true,
      };
      setRetryingMessageId(null);
      const newMessages = [...truncatedMessages, botMsg];
      setMessages(newMessages);
      
      if (config.onMessage && config.chatId) {
        config.onMessage(botMsg, config.chatId);
      }
      
      if (config.onOverwriteMessages) {
        config.onOverwriteMessages(newMessages);
      }
      
      setIsStreaming(false);
      setIsAiTyping(false);
      setFirstResponseId(null);
      setStreamingText("");
      setIsLoading(false);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setIsAiTyping(false);
        return;
      }
      console.error("Retry failed:", apiError);

      const errorMsg =
        "An error occurred while regenerating the response. " +
        (apiError.message || "");

      const errorBubble: Message = {
        id: Date.now().toString(),
        role: "model",
        text: errorMsg,
        timestamp: Date.now(),
        stopped: true,
      };

      const newMessages = [...truncatedMessages, errorBubble];
      setMessages(newMessages);

      if (config.onOverwriteMessages) {
        config.onOverwriteMessages(newMessages);
      }

      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
      setStreamingText("");
      setFirstResponseId(null);
      setRetryingMessageId(null);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setIsAiTyping(false);
    }
  };

  const handleUndoMessage = (messageId: string) => {
    const msgIndex = messages.findIndex((m: Message) => m.id === messageId);
    if (msgIndex === -1) return;

    const truncatedMessages = messages.slice(0, msgIndex);

    cancelCurrentRequest();
    cleanupAbortController();
    isRequestCancelledRef.current = true;

    setMessages(truncatedMessages);
    config.onOverwriteMessages?.(truncatedMessages);

    setRetryingMessageId(null);
    setLastSentMessage(null);
    setIsLoading(false);
    setIsStreaming(false);
    setIsAiTyping(false);
    setStreamingText("");
    setFirstResponseId(null);

    const firstAssistantMessage = truncatedMessages.find(
      (message: Message) => message.role === "model",
    );
    const firstUserMessage = truncatedMessages.find(
      (message: Message) => message.role === "user",
    );
    const savedHistory = truncatedMessages.map((message: Message) => ({
      role: message.role === "model" ? "Assistant" : "User",
      content: message.text,
    }));

    apiRestoreSession(
      config.currentModel,
      firstAssistantMessage?.text || getImageDescription() || "",
      firstUserMessage?.text || null,
      savedHistory,
      config.startupImage?.path || null,
    );
  };

  const handleStopGeneration = (truncatedText?: string) => {
    isRequestCancelledRef.current = true;
    cancelCurrentRequest();
    cleanupAbortController();

    if (typeof truncatedText === "string") {
      replaceLastAssistantHistory(truncatedText);
      if (messages.length === 0) {
        setImageDescription(truncatedText);
      }

      if (streamingText && firstResponseId) {
        const botMsg: Message = {
          id: firstResponseId,
          role: "model",
          text: truncatedText,
          timestamp: Date.now(),
          stopped: true,
          alreadyStreamed: true,
        };
        setMessages((prev: Message[]) => {
          const idx = prev.findIndex((m) => m.id === botMsg.id);
          if (idx !== -1) {
            const newMsgs = [...prev];
            newMsgs[idx] = botMsg;
            config.onOverwriteMessages?.(newMsgs);
            return newMsgs;
          }
          const newMsgs = [...prev, botMsg];
          config.onOverwriteMessages?.(newMsgs);
          return newMsgs;
        });
      } else {
        setMessages((prev: Message[]) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "model") {
              updated[i] = {
                ...updated[i],
                text: truncatedText,
                stopped: true,
                alreadyStreamed: true,
              };
              break;
            }
          }

          config.onOverwriteMessages?.(updated);
          return updated;
        });
      }
    } else if (config.state.retryingMessageId) {
      const oldMessages = preRetryMessagesRef.current;
      setMessages(oldMessages);
      config.onOverwriteMessages?.(oldMessages);
    } else {
      const stoppedMsg: Message = {
        id: Date.now().toString(),
        role: "model",
        text: "You stopped this response.",
        timestamp: Date.now(),
        stopped: true,
      };
      setMessages((prev: Message[]) => [...prev, stoppedMsg]);
      const targetChatId = sessionChatIdRef.current;
      if (config.onMessage && targetChatId) {
        config.onMessage(stoppedMsg, targetChatId);
      }
    }

    setRetryingMessageId(null);
    setIsLoading(false);
    setIsStreaming(false);
    setIsAiTyping(false);
    setStreamingText("");
    setFirstResponseId(null);
  };

  const handleStreamComplete = () => {
    if (streamingText && firstResponseId) {
      const botMsg: Message = {
        id: firstResponseId,
        role: "model",
        text: streamingText,
        timestamp: Date.now(),
        alreadyStreamed: true,
      };
      setMessages((prev: Message[]) => {
        const idx = prev.findIndex((m) => m.id === botMsg.id);
        if (idx !== -1) {
          const newMsgs = [...prev];
          newMsgs[idx] = botMsg;
          config.onOverwriteMessages?.(newMsgs);
          return newMsgs;
        }
        const newMsgs = [...prev, botMsg];
        config.onOverwriteMessages?.(newMsgs);
        return newMsgs;
      });
      setStreamingText("");
      setFirstResponseId(null);
    }
    setIsStreaming(false);
    setIsAiTyping(false);
  };

  return {
    startSession,
    handleSend,
    handleRetrySend,
    handleRetryMessage,
    handleUndoMessage,
    handleDescribeEdits,
    handleStopGeneration,
    handleStreamComplete,
    cleanupAbortController,
  };
};
