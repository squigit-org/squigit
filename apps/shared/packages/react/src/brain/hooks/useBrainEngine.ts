/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import type {
  Message,
  PendingAssistantTurn,
  PendingAssistantRequestKind,
  ToolStep,
  BrainEngineHandle,
  BrainStartupImage,
} from "@squigit/core/brain/engine";
import { prepareBrainInput } from "@squigit/core/brain/attachments";
import {
  cancelActiveProviderRequest as cancelActiveBrainRequest,
  requestProviderQuickAnswer as requestBrainQuickAnswer,
  retryProviderMessage as retryBrainMessage,
  sendProviderMessage as sendBrainMessage,
  startProviderSessionStream as startBrainSessionStream,
} from "@squigit/core/brain/provider";
import {
  buildModelAttemptPlan,
  DEFAULT_MODEL_SELECTION,
  type ModelEffort,
  type ModelId,
  type ModelSelection,
} from "@squigit/core/config";

import {
  advanceStreamCursorByWords,
  countRemainingStreamWords,
  getRenderableStreamingText,
  getStreamBatchSize,
  STREAM_PLAYBACK_INTERVAL_MS,
  STREAM_PRIME_DELAY_MS,
} from "@squigit/core/brain/engine";
import { createToolEventHandler } from "@squigit/core/brain/engine";

import {
  getFriendlyBrainErrorMessage,
} from "@squigit/core/brain/provider";

import {
  replaceLastAssistantHistory,
  restoreBrainSession,
  setImageDescription,
  getImageDescription,
} from "@squigit/core/brain/session";
import { API_STATUS_TEXT, mapToolStatusText } from "@squigit/core/helpers";

const DEFAULT_THREAD_TITLE_NORMALIZED = "new thread";

function normalizeThreadTitle(title: string | null | undefined): string {
  if (!title) return "";

  return title.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isUntitledThreadTitle(title: string | null | undefined): boolean {
  const normalized = normalizeThreadTitle(title);
  return (
    normalized.length === 0 || normalized === DEFAULT_THREAD_TITLE_NORMALIZED
  );
}

export const useBrainEngine = (config: {
  apiKey: string;
  currentModel: ModelId;
  currentEffort: ModelEffort;
  threadId: string | null;
  threadTitle: string;
  startupImage: BrainStartupImage | null;
  onMissingApiKey?: () => void;
  onMessage?: (message: Message, threadId: string) => void;
  onOverwriteMessages?: (messages: Message[]) => void;
  onTitleGenerated?: (title: string) => void;
  generateTitle?: (
    text: string,
    modelCandidates: readonly string[],
  ) => Promise<string>;
  state: any; // from useThreadState
  userName?: string;
  userEmail?: string;
}): BrainEngineHandle => {
  const {
    messages,
    setMessages,
    setIsLoading,
    setIsStreaming,
    setIsAiTyping,
    setFirstResponseId,
    setRetryingMessageId,
    setLastSentMessage,
    resetInitialUi,
    appendErrorMessage,
    setToolStatus,
    setStreamingToolSteps,
    setStreamingCitations,
    lastSentMessage,
    pendingAssistantTurn,
    pendingAssistantTurnRef,
    setPendingAssistantTurn,
  } = config.state;

  const sessionThreadIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestCancelledRef = useRef(false);
  const preRetryMessagesRef = useRef<Message[]>([]);
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackCursorRef = useRef(0);
  const activePendingTurnIdRef = useRef<string | null>(null);
  const finalizedPendingTurnIdRef = useRef<string | null>(null);
  const activeComposerSelectionRef = useRef<ModelSelection>({
    ...DEFAULT_MODEL_SELECTION,
  });

  const cleanupAbortController = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const clearPlaybackTimeout = () => {
    if (playbackTimeoutRef.current !== null) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
  };

  const clearPrimingTimeout = () => {
    if (primingTimeoutRef.current !== null) {
      clearTimeout(primingTimeoutRef.current);
      primingTimeoutRef.current = null;
    }
  };

  const clearFinalizeTimeout = () => {
    if (finalizeTimeoutRef.current !== null) {
      clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = null;
    }
  };

  const clearPendingTimers = () => {
    clearPlaybackTimeout();
    clearPrimingTimeout();
    clearFinalizeTimeout();
  };

  const resetToolStreamingState = () => {
    setToolStatus(null);
    setStreamingToolSteps([]);
    setStreamingCitations([]);
  };

  const resetTransientResponseState = () => {
    setToolStatus(null);
    setStreamingToolSteps([]);
    setStreamingCitations([]);
    setFirstResponseId(null);
  };

  const getThoughtSecondsFromToolSteps = (
    steps: ToolStep[],
  ): number | undefined => {
    const seconds = steps.reduce((sum, step) => {
      if (
        typeof step.startedAtMs === "number" &&
        typeof step.endedAtMs === "number" &&
        step.endedAtMs >= step.startedAtMs
      ) {
        return (
          sum +
          Math.max(1, Math.round((step.endedAtMs - step.startedAtMs) / 1000))
        );
      }
      const match = step.message?.trim().match(/^Thought for (\d+)s$/i);
      if (!match) return sum;
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return sum;
      return sum + parsed;
    }, 0);

    return seconds > 0 ? seconds : undefined;
  };

  const getElapsedThoughtSeconds = (startedAtMs: number): number => {
    return Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
  };

  const getDefaultProgressText = (
    requestKind: PendingAssistantRequestKind,
  ): string => {
    if (requestKind === "initial" || requestKind === "edit") {
      return API_STATUS_TEXT.ANALYZING_IMAGE;
    }
    return "";
  };

  const beginPendingAssistantTurn = (
    id: string,
    requestKind: PendingAssistantRequestKind,
    requestStartedAtMs: number,
  ) => {
    finalizedPendingTurnIdRef.current = null;
    playbackCursorRef.current = 0;
    clearPendingTimers();
    setPendingAssistantTurn({
      id,
      requestKind,
      phase: "thinking",
      requestStartedAtMs,
      thoughtSeconds: undefined,
      progressText: getDefaultProgressText(requestKind),
      rawText: "",
      displayText: "",
      transportDone: false,
      toolSteps: [],
      pendingCitations: [],
      visibleCitations: [],
      stopped: false,
      isWritingCode: false,
    } satisfies PendingAssistantTurn);
    resetTransientResponseState();
    setIsStreaming(true);
    setIsAiTyping(true);
  };

  const updatePendingAssistantTurn = (
    updater: (turn: PendingAssistantTurn) => PendingAssistantTurn,
  ) => {
    setPendingAssistantTurn((previous: PendingAssistantTurn | null) => {
      if (!previous) return previous;
      return updater(previous);
    });
  };

  const appendPendingRawText = (token: string) => {
    if (!token) return;

    updatePendingAssistantTurn((turn) => {
      const nextRawText = `${turn.rawText}${token}`;
      const hasFirstVisibleText =
        turn.rawText.trim().length === 0 && nextRawText.trim().length > 0;

      return {
        ...turn,
        rawText: nextRawText,
        thoughtSeconds: hasFirstVisibleText
          ? getElapsedThoughtSeconds(turn.requestStartedAtMs)
          : turn.thoughtSeconds,
        phase: hasFirstVisibleText ? "primed" : turn.phase,
      };
    });
  };

  const resetPendingRawText = () => {
    playbackCursorRef.current = 0;
    clearPendingTimers();
    updatePendingAssistantTurn((turn) => ({
      ...turn,
      phase: "thinking",
      thoughtSeconds: undefined,
      rawText: "",
      displayText: "",
      transportDone: false,
      visibleCitations: [],
      stopped: false,
    }));
  };

  const markPendingTransportDone = (finalResponse: string) => {
    updatePendingAssistantTurn((turn) => {
      const nextRawText =
        finalResponse.trim().length > 0 ? finalResponse : turn.rawText;
      const hasVisibleText = nextRawText.trim().length > 0;

      return {
        ...turn,
        rawText: nextRawText,
        thoughtSeconds: hasVisibleText
          ? (turn.thoughtSeconds ??
            getElapsedThoughtSeconds(turn.requestStartedAtMs))
          : turn.thoughtSeconds,
        phase:
          turn.phase === "thinking"
            ? hasVisibleText
              ? "primed"
              : "complete"
            : turn.phase,
        transportDone: true,
        visibleCitations:
          !hasVisibleText && turn.phase === "thinking"
            ? turn.pendingCitations
            : turn.visibleCitations,
      };
    });
  };

  const clearPendingAssistantTurn = () => {
    clearPendingTimers();
    playbackCursorRef.current = 0;
    activePendingTurnIdRef.current = null;
    finalizedPendingTurnIdRef.current = null;
    setPendingAssistantTurn(null);
    resetTransientResponseState();
  };

  const buildCommittedAssistantMessage = (
    turn: PendingAssistantTurn,
  ): Message => {
    const isStopped = turn.stopped || turn.phase === "stopped";
    const committedText =
      turn.rawText.trim().length > 0 ? turn.rawText : turn.displayText;

    return {
      id: turn.id,
      role: "model",
      text: committedText.trimEnd(),
      timestamp: Date.now(),
      thoughtSeconds:
        turn.thoughtSeconds ?? getThoughtSecondsFromToolSteps(turn.toolSteps),
      stopped: isStopped,
      alreadyStreamed: true,
      citations: turn.visibleCitations,
      toolSteps: turn.toolSteps,
    };
  };

  const commitPendingAssistantTurn = (turn: PendingAssistantTurn) => {
    if (finalizedPendingTurnIdRef.current === turn.id) return;
    finalizedPendingTurnIdRef.current = turn.id;

    const botMsg = buildCommittedAssistantMessage(turn);

    if (turn.displayText !== turn.rawText && botMsg.text.trim().length > 0) {
      replaceLastAssistantHistory(botMsg.text);
      if (messages.length === 0) {
        setImageDescription(botMsg.text);
      }
    }

    setMessages((previous: Message[]) => {
      const newMessages = [...previous, botMsg];
      config.onOverwriteMessages?.(newMessages);
      return newMessages;
    });

    setLastSentMessage(null);
    setRetryingMessageId(null);
    setIsLoading(false);
    setIsStreaming(false);
    setIsAiTyping(false);
    clearPendingAssistantTurn();
  };

  const clearPendingGenerationState = () => {
    clearPendingAssistantTurn();
    resetToolStreamingState();
    setIsLoading(false);
    setIsStreaming(false);
    setIsAiTyping(false);
  };

  useEffect(() => {
    const nextTurnId = pendingAssistantTurn?.id ?? null;
    if (activePendingTurnIdRef.current !== nextTurnId) {
      clearPendingTimers();
      playbackCursorRef.current = 0;
      activePendingTurnIdRef.current = nextTurnId;
    }

    if (!pendingAssistantTurn) {
      finalizedPendingTurnIdRef.current = null;
    }
  }, [pendingAssistantTurn?.id]);

  useEffect(() => {
    return () => {
      clearPendingTimers();
    };
  }, []);

  useEffect(() => {
    const turn = pendingAssistantTurn;
    if (!turn) return;

    if (turn.phase === "stopped" || turn.stopped) {
      clearPlaybackTimeout();
      clearPrimingTimeout();
      return;
    }

    if (turn.phase === "complete") {
      clearPlaybackTimeout();
      clearPrimingTimeout();
      if (finalizeTimeoutRef.current === null) {
        finalizeTimeoutRef.current = setTimeout(() => {
          finalizeTimeoutRef.current = null;
          const latest = pendingAssistantTurnRef.current;
          if (!latest || latest.id !== turn.id || latest.phase !== "complete") {
            return;
          }
          commitPendingAssistantTurn(latest);
        }, 180);
      }
      return;
    }

    clearFinalizeTimeout();

    if (turn.phase === "thinking") {
      clearPrimingTimeout();
      clearPlaybackTimeout();
      return;
    }

    if (turn.phase === "primed") {
      clearPlaybackTimeout();
      if (!turn.rawText.trim()) return;
      if (primingTimeoutRef.current === null) {
        primingTimeoutRef.current = setTimeout(() => {
          primingTimeoutRef.current = null;
          const latest = pendingAssistantTurnRef.current;
          if (!latest || latest.id !== turn.id || latest.phase !== "primed") {
            return;
          }

          setPendingAssistantTurn((previous: PendingAssistantTurn | null) => {
            if (
              !previous ||
              previous.id !== turn.id ||
              previous.phase !== "primed"
            ) {
              return previous;
            }
            return {
              ...previous,
              phase: previous.transportDone ? "finalizing" : "streaming",
            };
          });
        }, STREAM_PRIME_DELAY_MS);
      }
      return;
    }

    clearPrimingTimeout();

    if (turn.rawText.length < playbackCursorRef.current) {
      playbackCursorRef.current = 0;
    }

    const remainingWords = countRemainingStreamWords(
      turn.rawText,
      playbackCursorRef.current,
    );

    if (remainingWords === 0) {
      clearPlaybackTimeout();
      if (!turn.transportDone) return;

      const { text: visibleText, isWritingCode } = getRenderableStreamingText(
        turn.rawText.slice(0, playbackCursorRef.current),
      );

      updatePendingAssistantTurn((currentTurn) => ({
        ...currentTurn,
        displayText: visibleText,
        isWritingCode,
        phase: "complete",
        visibleCitations: currentTurn.pendingCitations,
      }));
      return;
    }

    if (playbackTimeoutRef.current !== null) return;

    playbackTimeoutRef.current = setTimeout(() => {
      playbackTimeoutRef.current = null;
      const latest = pendingAssistantTurnRef.current;
      if (
        !latest ||
        latest.stopped ||
        (latest.phase !== "streaming" && latest.phase !== "finalizing")
      ) {
        return;
      }

      if (latest.rawText.length < playbackCursorRef.current) {
        playbackCursorRef.current = 0;
      }

      const backlogWords = countRemainingStreamWords(
        latest.rawText,
        playbackCursorRef.current,
      );

      if (backlogWords === 0) {
        if (latest.transportDone) {
          const { text: visibleText, isWritingCode } =
            getRenderableStreamingText(
              latest.rawText.slice(0, playbackCursorRef.current),
            );
          updatePendingAssistantTurn((currentTurn) => ({
            ...currentTurn,
            displayText: visibleText,
            isWritingCode,
            phase: "complete",
            visibleCitations: currentTurn.pendingCitations,
          }));
        }
        return;
      }

      const nextCursor = advanceStreamCursorByWords(
        latest.rawText,
        playbackCursorRef.current,
        getStreamBatchSize(backlogWords),
      );
      playbackCursorRef.current = nextCursor;

      const { text: nextDisplayText, isWritingCode } =
        getRenderableStreamingText(latest.rawText.slice(0, nextCursor));
      const isBufferDrained = nextCursor >= latest.rawText.length;

      updatePendingAssistantTurn((currentTurn) => ({
        ...currentTurn,
        displayText: nextDisplayText,
        isWritingCode,
        phase:
          isBufferDrained && currentTurn.transportDone
            ? "complete"
            : currentTurn.transportDone
              ? "finalizing"
              : "streaming",
        visibleCitations:
          isBufferDrained && currentTurn.transportDone
            ? currentTurn.pendingCitations
            : currentTurn.visibleCitations,
      }));
    }, STREAM_PLAYBACK_INTERVAL_MS);
  }, [
    commitPendingAssistantTurn,
    pendingAssistantTurn,
    pendingAssistantTurnRef,
    setPendingAssistantTurn,
  ]);

  const createStreamToolTracker = (onResetText?: () => void) =>
    createToolEventHandler({
      onResetText,
      setToolStatus,
      setStreamingToolSteps,
      setStreamingCitations,
      updatePendingAssistantTurn,
      mapToolStatusText,
      getDefaultProgressText,
    });

  const startSession = async (
    key: string,
    selection: ModelSelection,
    imgData: {
      path: string;
      mimeType: string;
      imageId: string;
      fromHistory?: boolean;
    } | null,
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    sessionThreadIdRef.current = config.threadId;
    isRequestCancelledRef.current = false;

    setIsLoading(true);

    if (!key) {
      if (config.onMissingApiKey) config.onMissingApiKey();
      setIsLoading(false);
      return;
    }

    resetInitialUi();
    setMessages([]);
    setLastSentMessage(null);

    if (!imgData) {
      setIsLoading(false);
      return;
    }

    resetToolStreamingState();
    const requestStartedAtMs = Date.now();
    const responseId = Date.now().toString();
    beginPendingAssistantTurn(responseId, "initial", requestStartedAtMs);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (signal.aborted) {
      clearPendingGenerationState();
      return;
    }
    let hasGeneratedTitleFromBrief = false;
    const mainCandidates = buildModelAttemptPlan(selection, "main");
    const microTaskCandidates = buildModelAttemptPlan(selection, "micro");

    try {
      if (signal.aborted) {
        clearPendingGenerationState();
        return;
      }

      const toolTracker = createStreamToolTracker(resetPendingRawText);

      console.log(
        "[useBrainEngine] Starting with model candidates:",
        mainCandidates,
      );
      const responseText = await startBrainSessionStream(
        mainCandidates,
        microTaskCandidates,
        imgData.path,
        (token: string) => {
          if (signal.aborted) return;
          appendPendingRawText(token);
        },
        config.threadId,
        config.userName,
        config.userEmail,
        (brief: string) => {
          if (
            hasGeneratedTitleFromBrief ||
            imgData.fromHistory ||
            !config.generateTitle ||
            !config.onTitleGenerated
          ) {
            return;
          }

          hasGeneratedTitleFromBrief = true;
          console.log(
            "[useBrainEngine] Triggering title generation using image brief",
          );
          config
            .generateTitle(brief, microTaskCandidates)
            .then((title) => {
              console.log("[useBrainEngine] Title generated:", title);
              if (!signal.aborted) config.onTitleGenerated?.(title);
            })
            .catch(console.error);
        },
        toolTracker.onEvent,
      );
      console.log("[useBrainEngine] startBrainSessionStream finished!");

      if (signal.aborted) {
        clearPendingGenerationState();
        return;
      }

      void toolTracker;
      markPendingTransportDone(responseText);
    } catch (apiError: any) {
      if (
        signal.aborted ||
        apiError?.message === "CANCELLED" ||
        isRequestCancelledRef.current
      ) {
        return;
      }

      console.error(apiError);
      cancelActiveBrainRequest();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const errorMsg = getFriendlyBrainErrorMessage(apiError);

      clearPendingAssistantTurn();
      appendErrorMessage(
        errorMsg,
        sessionThreadIdRef.current || config.threadId,
      );
    } finally {
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
        config.threadId,
      );
      return;
    }
    const targetThreadId = config.threadId;
    sessionThreadIdRef.current = targetThreadId;
    isRequestCancelledRef.current = false;

    setIsLoading(true);
    resetInitialUi();
    setMessages([]);
    setLastSentMessage(null);

    resetToolStreamingState();
    const requestStartedAtMs = Date.now();
    const responseId = Date.now().toString();
    beginPendingAssistantTurn(responseId, "edit", requestStartedAtMs);

    try {
      if (!config.startupImage) {
        throw new Error("Cannot start session. Missing required data.");
      }
      const startupImage = config.startupImage;
      const selection: ModelSelection = {
        modelId: config.currentModel,
        effort: config.currentEffort,
      };
      const mainCandidates = buildModelAttemptPlan(selection, "main");
      const microTaskCandidates = buildModelAttemptPlan(selection, "micro");

      const toolTracker = createStreamToolTracker(resetPendingRawText);

      const responseText = await startBrainSessionStream(
        mainCandidates,
        microTaskCandidates,
        startupImage.path,
        (token: string) => {
          appendPendingRawText(token);
        },
        config.threadId,
        undefined,
        undefined,
        undefined,
        toolTracker.onEvent,
      );

      void toolTracker;
      markPendingTransportDone(responseText);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        return;
      }
      console.error(apiError);
      const errorMsg = getFriendlyBrainErrorMessage(apiError);

      clearPendingAssistantTurn();
      appendErrorMessage(errorMsg, targetThreadId);
    }
  };

  const handleRetrySend = async () => {
    if (!lastSentMessage) return;
    sessionThreadIdRef.current = config.threadId;
    setIsLoading(true);
    isRequestCancelledRef.current = false;
    setMessages((prev: Message[]) => [...prev, lastSentMessage]);
    const targetThreadId = config.threadId;
    resetToolStreamingState();
    const requestStartedAtMs = Date.now();
    const responseId = (Date.now() + 1).toString();
    beginPendingAssistantTurn(responseId, "message", requestStartedAtMs);

    try {
      const preparedInput = await prepareBrainInput(
        lastSentMessage.text,
        config.threadId,
      );
      const toolTracker = createStreamToolTracker(resetPendingRawText);
      const mainCandidates = buildModelAttemptPlan(
        activeComposerSelectionRef.current,
        "main",
      );
      const responseText = await sendBrainMessage(
        preparedInput.brainText,
        mainCandidates,
        (token: string) => {
          appendPendingRawText(token);
        },
        config.threadId,
        toolTracker.onEvent,
      );

      void toolTracker;
      markPendingTransportDone(responseText);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        return;
      }
      clearPendingAssistantTurn();
      appendErrorMessage(
        getFriendlyBrainErrorMessage(apiError),
        targetThreadId,
      );
    }
  };

  const handleSend = async (
    userText: string,
    selection?: ModelSelection,
  ) => {
    if (!userText.trim() || config.state.isLoading) return;
    const targetThreadId = config.threadId;
    sessionThreadIdRef.current = targetThreadId;
    const preparedInput = await prepareBrainInput(userText, targetThreadId);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: preparedInput.displayText,
      timestamp: Date.now(),
    };

    setLastSentMessage(userMsg);
    setMessages((prev: Message[]) => [...prev, userMsg]);
    if (config.onMessage && targetThreadId)
      config.onMessage(userMsg, targetThreadId);
    setIsLoading(true);
    isRequestCancelledRef.current = false;
    resetToolStreamingState();
    const requestStartedAtMs = Date.now();
    const responseId = (Date.now() + 1).toString();
    beginPendingAssistantTurn(responseId, "message", requestStartedAtMs);

    try {
      const activeSelection = selection ?? activeComposerSelectionRef.current;
      activeComposerSelectionRef.current = activeSelection;
      const mainCandidates = buildModelAttemptPlan(activeSelection, "main");
      const toolTracker = createStreamToolTracker(resetPendingRawText);
      const responseText = await sendBrainMessage(
        preparedInput.brainText,
        mainCandidates,
        (token: string) => {
          appendPendingRawText(token);
        },
        config.threadId,
        toolTracker.onEvent,
      );

      void toolTracker;
      markPendingTransportDone(responseText);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        return;
      }
      clearPendingAssistantTurn();
      appendErrorMessage(
        getFriendlyBrainErrorMessage(apiError),
        targetThreadId,
      );
    }
  };

  const handleRetryMessage = async (
    messageId: string,
    selection?: ModelSelection,
  ) => {
    const msgIndex = messages.findIndex((m: Message) => m.id === messageId);
    if (msgIndex === -1) return;
    sessionThreadIdRef.current = config.threadId;

    const truncatedMessages = messages.slice(0, msgIndex);
    const retrySelection = selection ?? activeComposerSelectionRef.current;
    activeComposerSelectionRef.current = retrySelection;
    const mainCandidates = buildModelAttemptPlan(retrySelection, "main");
    const microTaskCandidates = buildModelAttemptPlan(retrySelection, "micro");

    preRetryMessagesRef.current = [...messages];

    // Immediately truncate messages to avoid full text flash on completion
    setMessages(truncatedMessages);
    if (config.onOverwriteMessages) {
      config.onOverwriteMessages(truncatedMessages);
    }

    setRetryingMessageId(messageId); // Keep for "Analyzing" shimmer if needed
    setIsLoading(true);
    isRequestCancelledRef.current = false;
    resetToolStreamingState();
    const requestStartedAtMs = Date.now();

    const newResponseId = Date.now().toString();

    let fallbackImagePath: string | undefined;
    if (config.startupImage) {
      fallbackImagePath = config.startupImage.path;
    }

    try {
      const toolTracker = createStreamToolTracker(resetPendingRawText);
      beginPendingAssistantTurn(
        newResponseId,
        msgIndex === 0 ? "initial" : "retry",
        requestStartedAtMs,
      );
      const responseText = await retryBrainMessage(
        msgIndex,
        messages,
        mainCandidates,
        microTaskCandidates,
        config.threadId,
        (token: string) => {
          appendPendingRawText(token);
        },
        fallbackImagePath,
        undefined,
        toolTracker.onEvent,
      );

      if (
        msgIndex === 0 &&
        isUntitledThreadTitle(config.threadTitle) &&
        responseText.trim().length > 0 &&
        config.generateTitle &&
        config.onTitleGenerated
      ) {
        config
          .generateTitle(responseText, microTaskCandidates)
          .then((title) => config.onTitleGenerated?.(title))
          .catch(console.error);
      }

      void toolTracker;
      markPendingTransportDone(responseText);
    } catch (apiError: any) {
      if (apiError?.message === "CANCELLED" || isRequestCancelledRef.current) {
        return;
      }
      console.error("Retry failed:", apiError);
      const errorMsg = getFriendlyBrainErrorMessage(apiError);
      clearPendingAssistantTurn();
      setRetryingMessageId(null);
      appendErrorMessage(errorMsg, config.threadId);
    }
  };

  const handleUndoMessage = (messageId: string) => {
    const msgIndex = messages.findIndex((m: Message) => m.id === messageId);
    if (msgIndex === -1) return;

    const truncatedMessages = messages.slice(0, msgIndex);

    cancelActiveBrainRequest();
    cleanupAbortController();
    isRequestCancelledRef.current = true;

    setMessages(truncatedMessages);
    config.onOverwriteMessages?.(truncatedMessages);

    setRetryingMessageId(null);
    setLastSentMessage(null);
    clearPendingGenerationState();

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

    restoreBrainSession(
      config.currentModel,
      firstAssistantMessage?.text || getImageDescription() || "",
      firstUserMessage?.text || null,
      savedHistory,
      config.startupImage?.path || null,
    );
  };

  const handleStopGeneration = () => {
    isRequestCancelledRef.current = true;
    cancelActiveBrainRequest();
    cleanupAbortController();

    const currentPendingTurn = pendingAssistantTurnRef.current;
    if (
      currentPendingTurn &&
      (currentPendingTurn.phase !== "thinking" ||
        currentPendingTurn.displayText.trim().length > 0 ||
        currentPendingTurn.pendingCitations.length > 0)
    ) {
      const stoppedTurn: PendingAssistantTurn = {
        ...currentPendingTurn,
        phase: "stopped",
        stopped: true,
        transportDone: true,
        visibleCitations: currentPendingTurn.pendingCitations,
      };
      setPendingAssistantTurn(stoppedTurn);
      commitPendingAssistantTurn(stoppedTurn);
      return;
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
      const targetThreadId = sessionThreadIdRef.current || config.threadId;
      if (config.onMessage && targetThreadId) {
        config.onMessage(stoppedMsg, targetThreadId);
      }
    }

    setRetryingMessageId(null);
    clearPendingGenerationState();
  };

  const handleQuickAnswer = async () => {
    await requestBrainQuickAnswer();
    setToolStatus(API_STATUS_TEXT.WRAPPING_UP);
    updatePendingAssistantTurn((turn) => ({
      ...turn,
      progressText: API_STATUS_TEXT.WRAPPING_UP,
    }));
  };

  const handleStreamComplete = () => {
    const currentPendingTurn = pendingAssistantTurnRef.current;
    if (currentPendingTurn?.phase === "complete") {
      commitPendingAssistantTurn(currentPendingTurn);
    }
  };

  return {
    startSession,
    handleSend,
    handleRetrySend,
    handleRetryMessage,
    handleUndoMessage,
    handleDescribeEdits,
    handleStopGeneration,
    handleQuickAnswer,
    handleStreamComplete,
    cleanupAbortController,
  };
};
