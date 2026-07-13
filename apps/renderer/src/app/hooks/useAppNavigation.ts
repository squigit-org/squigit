/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  cancelOcrJob,
  EMPTY_STATE_ASSET_ID,
  getImagePath,
  loadThread,
  updateThreadMetadata,
  type OcrAnnotationEntry,
  type OcrAnnotations,
  type OcrModelAnnotation,
  resolveOcrModelId,
  ThreadCitation,
  ThreadToolStep,
} from "@squigit/core/config";
import {
  type Citation,
  type Message,
  type ToolStep,
} from "@squigit/core/brain/engine";

const SYSTEM_GALLERY_ID = "__system_gallery";
const isOnboardingId = (id: string) => id.startsWith("__system_");

type SearchRevealTarget = {
  threadId: string;
  messageIndex: number;
  requestedAt: number;
};

const isScannedOcrEntry = (
  entry: OcrAnnotationEntry | undefined,
): entry is OcrModelAnnotation =>
  !!entry && !Array.isArray(entry) && !!entry.scanned_at;

const getThreadOcrModel = (annotations: OcrAnnotations): string => {
  let latestModelId = "";
  let latestScannedAt = -Infinity;

  for (const [modelId, entry] of Object.entries(annotations)) {
    if (!isScannedOcrEntry(entry)) continue;

    const scannedAt = new Date(entry.scanned_at || 0).getTime();
    if (scannedAt > latestScannedAt) {
      latestModelId = modelId;
      latestScannedAt = scannedAt;
    }
  }

  return resolveOcrModelId(latestModelId, "");
};

const withNavigationOcrGuard = (
  annotations: OcrAnnotations,
): OcrAnnotations => ({
  ...annotations,
  [EMPTY_STATE_ASSET_ID]: [],
});

function normalizeStoredCitations(
  citations: ThreadCitation[] | undefined,
): Citation[] {
  return Array.isArray(citations) ? citations : [];
}

function normalizeStoredToolSteps(
  toolSteps: ThreadToolStep[] | undefined,
): ToolStep[] {
  if (!Array.isArray(toolSteps)) {
    return [];
  }

  return toolSteps.map((step) => ({
    ...step,
    status:
      step.status === "running" ||
      step.status === "done" ||
      step.status === "error"
        ? step.status
        : typeof step.endedAtMs === "number"
          ? "done"
          : "running",
    message: step.message ?? undefined,
  }));
}

function mapStoredMessage(message: {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: ThreadCitation[];
  tool_steps?: ThreadToolStep[];
}): Message {
  return {
    id: "",
    role: message.role === "user" ? "user" : "model",
    text: message.content,
    timestamp: new Date(message.timestamp).getTime(),
    alreadyStreamed: true,
    citations: normalizeStoredCitations(message.citations),
    toolSteps: normalizeStoredToolSteps(message.tool_steps),
  };
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export const useAppNavigation = ({
  thread,
  threadHistory,
  ocr,
  system,
  threadTitle,
  isActiveThreadBusy,
  closeMediaViewer,
  runWithBusyGuard,
  getRememberedThreadOcrModel,
}: {
  thread: any;
  threadHistory: any;
  ocr: any;
  system: any;
  threadTitle: string;
  isActiveThreadBusy: boolean;
  closeMediaViewer: () => void;
  runWithBusyGuard: (action: () => void | Promise<void>) => void;
  getRememberedThreadOcrModel: (threadId: string) => string;
}) => {
  const [isNavigating, setIsNavigating] = useState(false);
  const [isThreadContentReady, setIsThreadContentReady] = useState(true);
  const [showThreadShellDuringNavigation, setShowThreadShellDuringNavigation] =
    useState(false);
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [pendingSearchReveal, setPendingSearchReveal] =
    useState<SearchRevealTarget | null>(null);

  const navigationRequestIdRef = useRef(0);
  const busyTouchStateRef = useRef<{
    threadId: string | null;
    isBusy: boolean;
  }>({
    threadId: null,
    isBusy: false,
  });

  const finalizeNavigationState = useCallback((requestId: number) => {
    if (navigationRequestIdRef.current !== requestId) {
      return;
    }

    flushSync(() => {
      setIsNavigating(false);
      setShowThreadShellDuringNavigation(false);
      setIsThreadContentReady(true);
    });
  }, []);

  useEffect(() => {
    const activeId = threadHistory.activeSessionId;
    const isBusy =
      !!activeId && !isOnboardingId(activeId) && isActiveThreadBusy;
    const lastState = busyTouchStateRef.current;
    const wasBusyForSameThread =
      lastState.threadId === activeId && lastState.isBusy;

    if (isBusy && !wasBusyForSameThread && activeId) {
      threadHistory.touchThread(activeId).catch(console.error);
    }

    busyTouchStateRef.current = {
      threadId: activeId,
      isBusy,
    };
  }, [threadHistory, isActiveThreadBusy]);

  useEffect(() => {
    if (isNavigating) return;

    const activeId = threadHistory.activeSessionId;
    if (activeId && threadTitle && threadTitle !== "New thread") {
      const currentThread = threadHistory.threads.find(
        (c: any) => c.id === activeId,
      );
      if (currentThread && currentThread.title !== threadTitle) {
        updateThreadMetadata({
          ...currentThread,
          title: threadTitle,
        }).then(() => {
          threadHistory.handleRenameThread(activeId, threadTitle);
        });
      }
    }
  }, [threadHistory, threadTitle, isNavigating]);

  const openSearchOverlay = useCallback(() => {
    setIsSearchOverlayOpen(true);
  }, []);

  const closeSearchOverlay = useCallback(() => {
    setIsSearchOverlayOpen(false);
  }, []);

  const clearSearchReveal = useCallback(() => {
    setPendingSearchReveal(null);
  }, []);

  const performSelectThread = useCallback(
    async (id: string) => {
      const requestId = navigationRequestIdRef.current + 1;
      navigationRequestIdRef.current = requestId;
      const metadata = threadHistory.threads.find(
        (threadMeta: any) => threadMeta.id === id,
      );

      flushSync(() => {
        setIsNavigating(true);
        setIsThreadContentReady(false);
        setShowThreadShellDuringNavigation(!isOnboardingId(id));
        setPendingSearchReveal(null);
        closeMediaViewer();
        ocr.setSessionLensUrl(null);

        if (!isOnboardingId(id) && metadata?.title) {
          system.setSessionThreadTitle(metadata.title);
        }
      });

      cancelOcrJob();
      flushSync(() => {
        ocr.setIsOcrScanning(false);
        ocr.setOcrData(withNavigationOcrGuard({}));
      });

      await waitForNextPaint();
      if (navigationRequestIdRef.current !== requestId) {
        return;
      }

      if (isOnboardingId(id)) {
        flushSync(() => {
          if (id.startsWith("__system_update")) {
            system.setSessionThreadTitle("Update Available");
          } else if (id === SYSTEM_GALLERY_ID) {
            system.setSessionThreadTitle("Gallery");
          }
          threadHistory.setActiveSessionId(id);
        });
        finalizeNavigationState(requestId);
        return;
      }

      try {
        const imagePathPromise = metadata?.image_hash
          ? getImagePath(metadata.image_hash)
          : null;
        const threadDataPromise = loadThread(id);

        if (imagePathPromise && metadata?.image_hash) {
          const imagePath = await imagePathPromise;
          if (navigationRequestIdRef.current !== requestId) {
            return;
          }

          flushSync(() => {
            system.setStartupImage({
              path: imagePath,
              mimeType: "image/png",
              imageId: metadata.image_hash,
              fromHistory: true,
              tone: "d",
            });
            threadHistory.setActiveSessionId(id);
          });

          thread.restoreState(
            {
              messages: [],
              firstResponseId: null,
            },
            {
              path: imagePath,
              mimeType: "image/png",
              imageId: metadata.image_hash,
            },
            null,
          );

          await waitForNextPaint();
          if (navigationRequestIdRef.current !== requestId) {
            return;
          }
        }

        const threadData = await threadDataPromise;
        if (navigationRequestIdRef.current !== requestId) {
          return;
        }

        const imagePath = imagePathPromise
          ? await imagePathPromise
          : await getImagePath(threadData.metadata.image_hash);
        if (navigationRequestIdRef.current !== requestId) {
          return;
        }

        const loadedOcrData = threadData.ocr_data || {};
        const navigationSafeOcrData = withNavigationOcrGuard(loadedOcrData);
        const rememberedOcrModel = getRememberedThreadOcrModel(id);
        const latestScannedOcrModel = getThreadOcrModel(loadedOcrData);
        const threadOcrModel =
          rememberedOcrModel ||
          latestScannedOcrModel ||
          (system.ocrEnabled
            ? resolveOcrModelId(system.startupOcrLanguage, "")
            : "");
        flushSync(() => {
          system.setSessionThreadTitle(threadData.metadata.title);
          system.setSessionOcrLanguage(threadOcrModel);
          ocr.setOcrData(navigationSafeOcrData);
          ocr.setSessionLensUrl(
            threadData.reverse_image_search?.google_lens_url || null,
          );
          system.setStartupImage({
            path: imagePath,
            mimeType: "image/png",
            imageId: threadData.metadata.image_hash,
            fromHistory: true,
            tone: threadData.image_tone ?? undefined,
          });
          threadHistory.setActiveSessionId(id);
        });
        await waitForNextPaint();
        if (navigationRequestIdRef.current !== requestId) {
          return;
        }

        const messages = threadData.messages.map((message, idx) => ({
          ...mapStoredMessage(message),
          id: idx.toString(),
        }));

        thread.restoreState(
          {
            messages,
            firstResponseId: null,
          },
          {
            path: imagePath,
            mimeType: "image/png",
            imageId: threadData.metadata.image_hash,
          },
          threadData.image_brief,
        );
      } catch (e) {
        console.error("Failed to load thread:", e);
      } finally {
        finalizeNavigationState(requestId);
      }
    },
    [
      thread,
      threadHistory,
      closeMediaViewer,
      finalizeNavigationState,
      ocr,
      system,
      getRememberedThreadOcrModel,
    ],
  );

  const performNewSession = useCallback(async () => {
    const requestId = navigationRequestIdRef.current + 1;
    navigationRequestIdRef.current = requestId;

    flushSync(() => {
      setIsNavigating(true);
      setIsThreadContentReady(false);
      setShowThreadShellDuringNavigation(false);
      setPendingSearchReveal(null);
      closeMediaViewer();
    });

    system.resetSession();
    threadHistory.setActiveSessionId(null);
    threadHistory.setActiveSessionId(null);
    ocr.setOcrData({});
    ocr.setSessionLensUrl(null);
    finalizeNavigationState(requestId);
  }, [threadHistory, closeMediaViewer, finalizeNavigationState, ocr, system]);

  const handleSelectThread = useCallback(
    (id: string) => {
      runWithBusyGuard(() => performSelectThread(id));
    },
    [performSelectThread, runWithBusyGuard],
  );

  const revealSearchMatch = useCallback(
    (payload: { threadId: string; messageIndex: number }) => {
      runWithBusyGuard(async () => {
        closeSearchOverlay();
        await performSelectThread(payload.threadId);
        setPendingSearchReveal({
          threadId: payload.threadId,
          messageIndex: payload.messageIndex,
          requestedAt: Date.now(),
        });
      });
    },
    [closeSearchOverlay, performSelectThread, runWithBusyGuard],
  );

  const handleNewSession = useCallback(() => {
    runWithBusyGuard(performNewSession);
  }, [performNewSession, runWithBusyGuard]);

  return {
    isNavigating,
    isThreadContentReady,
    showThreadShellDuringNavigation,
    searchOverlay: {
      isOpen: isSearchOverlayOpen,
      pendingReveal: pendingSearchReveal,
    },
    openSearchOverlay,
    closeSearchOverlay,
    clearSearchReveal,
    performSelectThread,
    performNewSession,
    handleSelectThread,
    revealSearchMatch,
    handleNewSession,
  };
};
