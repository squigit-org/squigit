/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Message, ToolStep, Citation } from "@/features";
import { appendChatMessage } from "@/lib";

export const useChatState = (enabled: boolean) => {
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
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [streamingToolSteps, setStreamingToolSteps] = useState<ToolStep[]>([]);
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);

  const clearError = () => setError(null);

  const resetInitialUi = () => {
    setStreamingText("");
    setError(null);
    setToolStatus(null);
    setStreamingToolSteps([]);
    setStreamingCitations([]);
  };

  const appendErrorMessage = (
    errorMsg: string,
    targetChatId?: string | null,
  ) => {
    const errorBubble: Message = {
      id: Date.now().toString(),
      role: "model",
      text: errorMsg,
      timestamp: Date.now(),
      stopped: true,
    };

    setMessages((prev) => [...prev, errorBubble]);

    if (targetChatId) {
      appendChatMessage(targetChatId, "assistant", errorMsg).catch(
        console.error,
      );
    }

    setIsLoading(false);
    setIsStreaming(false);
    setIsAiTyping(false);
    setStreamingText("");
    setFirstResponseId(null);
    setRetryingMessageId(null);
    setToolStatus(null);
    setStreamingToolSteps([]);
    setStreamingCitations([]);
  };

  return {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    error,
    setError,
    clearError,
    streamingText,
    setStreamingText,
    isStreaming,
    setIsStreaming,
    isAiTyping,
    setIsAiTyping,
    retryingMessageId,
    setRetryingMessageId,
    firstResponseId,
    setFirstResponseId,
    lastSentMessage,
    setLastSentMessage,
    toolStatus,
    setToolStatus,
    streamingToolSteps,
    setStreamingToolSteps,
    streamingCitations,
    setStreamingCitations,
    resetInitialUi,
    appendErrorMessage,
  };
};
