/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import type { Message } from "@squigit/core/brain/engine";
import { restoreBrainSession } from "@squigit/core/brain/session";
import type { ModelEffort, ModelId } from "@squigit/core/config";

export const useBrainLifecycle = (config: {
  enabled: boolean;
  threadId: string | null;
  startupImage: {
    path: string;
    mimeType: string;
    imageId: string;
    fromHistory?: boolean;
  } | null;
  apiKey: string;
  currentModel: ModelId;
  currentEffort: ModelEffort;
  onMissingApiKey?: () => void;
  state: any; // from useThreadState
  engine: any; // from useBrainEngine
}) => {
  const {
    messages,
    setMessages,
    setIsLoading,
    setFirstResponseId,
    setLastSentMessage,
    setError,
    setIsStreaming,
    setPendingAssistantTurn,
  } = config.state;

  const sessionStartedForImageRef = useRef<string | null>(null);

  useEffect(() => {
    if (config.enabled && !config.startupImage?.fromHistory) {
      setIsLoading(true);
    }

    return () => {
      config.engine.cleanupAbortController();
    };
  }, [config.enabled, config.startupImage?.fromHistory]);

  useEffect(() => {
    if (
      config.enabled &&
      config.startupImage &&
      !config.startupImage.fromHistory &&
      config.threadId
    ) {
      const imageKey =
        config.startupImage.path?.substring(0, 50) ?? config.threadId;
      if (sessionStartedForImageRef.current === imageKey) {
        return;
      }

      if (messages.length > 0) {
        return;
      }

      sessionStartedForImageRef.current = imageKey;

      console.log(
        "[useThreadLifecycle] startSession triggered for imageKey:",
        imageKey,
        "threadId:",
        config.threadId,
      );

      if (config.apiKey) {
        config.engine.startSession(
          config.apiKey,
          {
            modelId: config.currentModel,
            effort: config.currentEffort,
          },
          config.startupImage,
        );
      } else {
        if (config.onMissingApiKey) config.onMissingApiKey();
        setIsLoading(false);
      }
    }
  }, [
    config.apiKey,
    config.startupImage,
    config.currentModel,
    config.currentEffort,
    config.enabled,
    config.threadId,
    messages.length,
  ]);

  useEffect(() => {
    if (config.threadId === null) {
      setMessages([]);
      setFirstResponseId(null);
      setLastSentMessage(null);
      setError(null);
      setPendingAssistantTurn(null);
      sessionStartedForImageRef.current = null;
    }
  }, [config.threadId]);

  const getCurrentState = () => ({
    messages: config.state.messages,
    firstResponseId: config.state.firstResponseId,
  });

  const restoreState = async (
    state: {
      messages: Message[];
      firstResponseId: string | null;
    },
    image?: { path: string; mimeType: string; imageId: string },
  ) => {
    setMessages(state.messages);
    setFirstResponseId(state.firstResponseId);
    setIsLoading(false);
    setIsStreaming(false);
    setPendingAssistantTurn(null);

    // Clear the current image ref so a session doesn't auto-start
    sessionStartedForImageRef.current = image?.path?.substring(0, 50) ?? null;

    if (state.messages.length > 0) {
      try {
        const firstMsg = state.messages[0];
        const savedHistory = state.messages.map((m) => ({
          role: m.role === "model" ? "Assistant" : "User",
          content: m.text,
        }));

        const firstUserMsg = state.messages.find((m) => m.role === "user");

        let imagePath = null;

        if (image) {
          imagePath = image.path;
        }

        restoreBrainSession(
          config.currentModel,
          firstMsg.text,
          firstUserMsg?.text || null,
          savedHistory,
          imagePath,
        );
      } catch (e) {
        console.error("Failed to restore brain session:", e);
      }
    }
  };

  return { getCurrentState, restoreState, sessionStartedForImageRef };
};
