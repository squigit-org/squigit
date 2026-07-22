/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThreadState } from "./useThreadState";
import type { Message } from "@squigit/core/brain/engine";
import { useBrainEngine } from "./useBrainEngine";
import { useBrainLifecycle } from "./useBrainLifecycle";
import type { ModelEffort, ModelId, ModelSelection } from "@squigit/core/config";

export const useBrainSession = ({
  apiKey,
  currentModel,
  currentEffort,
  startupImage,
  enabled,
  onMessage,
  onOverwriteMessages,
  threadId,
  threadTitle,
  onMissingApiKey,
  onTitleGenerated,
  generateTitle,
  userName,
  userEmail,
}: {
  apiKey: string;
  currentModel: ModelId;
  currentEffort: ModelEffort;
  startupImage: {
    path: string;
    mimeType: string;
    imageId: string;
    fromHistory?: boolean;
  } | null;
  enabled: boolean;
  onMessage?: (message: Message, threadId: string) => void;
  onOverwriteMessages?: (messages: Message[]) => void;
  threadId: string | null;
  threadTitle: string;
  onMissingApiKey?: () => void;
  onTitleGenerated?: (title: string) => void;
  generateTitle?: (
    text: string,
    modelCandidates: readonly string[],
  ) => Promise<string>;
  userName?: string;
  userEmail?: string;
}) => {
  const state = useThreadState(enabled);

  const engine = useBrainEngine({
    apiKey,
    currentModel,
    currentEffort,
    threadId,
    threadTitle,
    startupImage,
    onMissingApiKey,
    onMessage,
    onOverwriteMessages,
    onTitleGenerated,
    generateTitle,
    state,
    userName,
    userEmail,
  });

  const lifecycle = useBrainLifecycle({
    enabled,
    threadId,
    startupImage,
    apiKey,
    currentModel,
    currentEffort,
    onMissingApiKey,
    state,
    engine,
  });

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    clearError: state.clearError,
    isStreaming: state.isStreaming,
    isAiTyping: state.isAiTyping,
    setIsAiTyping: state.setIsAiTyping,
    retryingMessageId: state.retryingMessageId,
    toolStatus: state.toolStatus,
    streamingToolSteps: state.streamingToolSteps,
    streamingCitations: state.streamingCitations,
    pendingAssistantTurn: state.pendingAssistantTurn,
    lastSentMessage: state.lastSentMessage,
    isSearching:
      !!state.pendingAssistantTurn &&
      (state.pendingAssistantTurn.toolSteps.length > 0 ||
        state.pendingAssistantTurn.pendingCitations.length > 0 ||
        /search|source|web/i.test(state.pendingAssistantTurn.progressText)),
    isAnalyzing:
      !!startupImage &&
      !!state.pendingAssistantTurn &&
      state.pendingAssistantTurn.requestKind === "initial" &&
      state.pendingAssistantTurn.phase === "thinking",
    isGenerating: !!state.pendingAssistantTurn,
    handleSend: engine.handleSend,
    handleRetrySend: engine.handleRetrySend,
    handleRetryMessage: engine.handleRetryMessage,
    handleUndoMessage: engine.handleUndoMessage,
    handleDescribeEdits: engine.handleDescribeEdits,
    handleStreamComplete: engine.handleStreamComplete,
    handleStopGeneration: engine.handleStopGeneration,
    handleQuickAnswer: engine.handleQuickAnswer,
    startSession: (
      key: string,
      selection: ModelSelection,
      imgData: {
        path: string;
        mimeType: string;
        imageId: string;
        fromHistory?: boolean;
      } | null,
    ) => engine.startSession(key, selection, imgData),
    getCurrentState: lifecycle.getCurrentState,
    restoreState: lifecycle.restoreState,
    appendErrorMessage: state.appendErrorMessage,
  };
};
