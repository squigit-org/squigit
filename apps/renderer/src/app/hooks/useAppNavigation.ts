/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
const MESSAGE_PREPARATION_CHUNK = 200;
const isOnboardingId = (id: string) => id.startsWith("__system_");

type SearchRevealTarget = {
  threadId: string;
  messageIndex: number;
  requestedAt: number;
};

export type SearchOverlayMode = "threads" | "workspaces";
export type HistoryNavigationDirection = "back" | "forward" | null;

interface RouteNavigationOptions {
  recordHistory?: boolean;
}

interface RouteHistorySnapshot {
  index: number;
  length: number;
}

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
  const [searchOverlayMode, setSearchOverlayMode] =
    useState<SearchOverlayMode>("threads");
  const [pendingSearchReveal, setPendingSearchReveal] =
    useState<SearchRevealTarget | null>(null);
  const [historyNavigationDirection, setHistoryNavigationDirection] =
    useState<HistoryNavigationDirection>(null);

  const navigationRequestIdRef = useRef(0);
  const routeHistoryRef = useRef<Array<string | null>>([
    threadHistory.activeSessionId,
  ]);
  const routeHistorySnapshotRef = useRef<RouteHistorySnapshot>({
    index: 0,
    length: 1,
  });
  const [routeHistorySnapshot, setRouteHistorySnapshot] =
    useState<RouteHistorySnapshot>(routeHistorySnapshotRef.current);
  const busyTouchStateRef = useRef<{
    threadId: string | null;
    isBusy: boolean;
  }>({
    threadId: null,
    isBusy: false,
  });

  const commitRouteHistorySnapshot = useCallback(
    (snapshot: RouteHistorySnapshot) => {
      routeHistorySnapshotRef.current = snapshot;
      setRouteHistorySnapshot(snapshot);
    },
    [],
  );

  const pushRouteHistory = useCallback(
    (routeId: string | null) => {
      const history = routeHistoryRef.current;
      const { index } = routeHistorySnapshotRef.current;

      if (history[index] === routeId) return;

      history.length = index + 1;
      history.push(routeId);
      commitRouteHistorySnapshot({
        index: history.length - 1,
        length: history.length,
      });
    },
    [commitRouteHistorySnapshot],
  );

  const commitNavigationState = useCallback(
    (requestId: number, commit?: () => void) => {
      if (navigationRequestIdRef.current !== requestId) {
        return false;
      }

      startTransition(() => {
        commit?.();
        setIsNavigating(false);
        setShowThreadShellDuringNavigation(false);
        setIsThreadContentReady(true);
      });
      return true;
    },
    [],
  );

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

  useEffect(() => {
    pushRouteHistory(threadHistory.activeSessionId);
  }, [pushRouteHistory, threadHistory.activeSessionId]);

  const openSearchOverlay = useCallback(
    (mode: SearchOverlayMode = "threads") => {
      setSearchOverlayMode(mode);
      setIsSearchOverlayOpen(true);
    },
    [],
  );

  const closeSearchOverlay = useCallback(() => {
    setIsSearchOverlayOpen(false);
  }, []);

  const clearSearchReveal = useCallback(() => {
    setPendingSearchReveal(null);
  }, []);

  const performSelectThread = useCallback(
    async (id: string, options: RouteNavigationOptions = {}) => {
      const requestId = navigationRequestIdRef.current + 1;
      navigationRequestIdRef.current = requestId;
      const previousActiveId = threadHistory.activeSessionId;
      const isThreadTarget = !isOnboardingId(id);
      const shouldShowTargetRouteImmediately =
        isThreadTarget || id === SYSTEM_GALLERY_ID;
      const metadata = threadHistory.threads.find(
        (threadMeta: any) => threadMeta.id === id,
      );

      if (options.recordHistory !== false) {
        pushRouteHistory(id);
      }

      cancelOcrJob();
      startTransition(() => {
        setIsNavigating(true);
        setIsThreadContentReady(false);
        setShowThreadShellDuringNavigation(isThreadTarget);
        setPendingSearchReveal(null);
        closeMediaViewer();
        ocr.setIsOcrScanning(false);
        ocr.setOcrData(withNavigationOcrGuard({}));
        ocr.setSessionLensUrl(null);
        threadHistory.setPendingWorkspaceId(null);

        if (isThreadTarget && metadata?.title) {
          system.setSessionThreadTitle(metadata.title);
        }

        if (id === SYSTEM_GALLERY_ID) {
          system.setSessionThreadTitle("Gallery");
        }

        if (shouldShowTargetRouteImmediately) {
          threadHistory.setActiveSessionId(id);
        }
      });

      await waitForNextPaint();
      if (navigationRequestIdRef.current !== requestId) {
        return;
      }

      if (isOnboardingId(id)) {
        commitNavigationState(requestId, () => {
          if (id.startsWith("__system_update")) {
            system.setSessionThreadTitle("Update Available");
          }
          if (!shouldShowTargetRouteImmediately) {
            threadHistory.setActiveSessionId(id);
          }
        });
        return;
      }

      try {
        const [threadData, metadataImagePath] = await Promise.all([
          loadThread(id),
          metadata?.image_hash
            ? getImagePath(metadata.image_hash)
            : Promise.resolve(null),
        ]);
        if (navigationRequestIdRef.current !== requestId) {
          return;
        }

        const imagePath =
          metadataImagePath ??
          (await getImagePath(threadData.metadata.image_hash));
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

        const messages: Message[] = [];
        for (let index = 0; index < threadData.messages.length; index += 1) {
          messages.push({
            ...mapStoredMessage(threadData.messages[index]),
            id: index.toString(),
          });

          if (
            (index + 1) % MESSAGE_PREPARATION_CHUNK === 0 &&
            index + 1 < threadData.messages.length
          ) {
            await waitForNextPaint();
            if (navigationRequestIdRef.current !== requestId) {
              return;
            }
          }
        }

        commitNavigationState(requestId, () => {
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
          void thread.restoreState(
            {
              messages,
              firstResponseId: null,
            },
            {
              path: imagePath,
              mimeType: "image/png",
              imageId: threadData.metadata.image_hash,
            },
          );
        });
      } catch (e) {
        console.error("Failed to load thread:", e);
        commitNavigationState(requestId, () => {
          threadHistory.setActiveSessionId(previousActiveId);
        });
      }
    },
    [
      thread,
      threadHistory,
      closeMediaViewer,
      commitNavigationState,
      ocr,
      system,
      getRememberedThreadOcrModel,
      pushRouteHistory,
    ],
  );

  const performNewSession = useCallback(
    async (
      workspaceId: string | null = null,
      options: RouteNavigationOptions = {},
    ) => {
      const requestId = navigationRequestIdRef.current + 1;
      navigationRequestIdRef.current = requestId;

      if (options.recordHistory !== false) {
        pushRouteHistory(null);
      }

      startTransition(() => {
        setIsNavigating(true);
        setIsThreadContentReady(false);
        setShowThreadShellDuringNavigation(false);
        setPendingSearchReveal(null);
        closeMediaViewer();
        threadHistory.setPendingWorkspaceId(workspaceId);
      });

      await waitForNextPaint();
      commitNavigationState(requestId, () => {
        system.resetSession();
        threadHistory.setActiveSessionId(null);
        ocr.setOcrData({});
        ocr.setSessionLensUrl(null);
      });
    },
    [
      threadHistory,
      closeMediaViewer,
      commitNavigationState,
      ocr,
      pushRouteHistory,
      system,
    ],
  );

  const handleNavigation = useCallback(
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

  const handleNewSession = useCallback(
    (workspaceId: string | null = null) => {
      runWithBusyGuard(() => performNewSession(workspaceId));
    },
    [performNewSession, runWithBusyGuard],
  );

  const navigateBack = useCallback(() => {
    if (
      routeHistorySnapshotRef.current.index === 0 ||
      isNavigating ||
      historyNavigationDirection !== null
    ) {
      return;
    }

    runWithBusyGuard(async () => {
      const currentSnapshot = routeHistorySnapshotRef.current;
      if (currentSnapshot.index === 0) return;

      const targetIndex = currentSnapshot.index - 1;
      const targetRoute = routeHistoryRef.current[targetIndex];
      commitRouteHistorySnapshot({
        index: targetIndex,
        length: currentSnapshot.length,
      });
      setHistoryNavigationDirection("back");
      try {
        if (targetRoute === null) {
          await performNewSession(null, { recordHistory: false });
        } else {
          await performSelectThread(targetRoute, { recordHistory: false });
        }
      } finally {
        await waitForNextPaint();
        setHistoryNavigationDirection(null);
      }
    });
  }, [
    commitRouteHistorySnapshot,
    historyNavigationDirection,
    isNavigating,
    performNewSession,
    performSelectThread,
    runWithBusyGuard,
  ]);

  const navigateForward = useCallback(() => {
    if (
      routeHistorySnapshotRef.current.index >=
        routeHistorySnapshotRef.current.length - 1 ||
      isNavigating ||
      historyNavigationDirection !== null
    ) {
      return;
    }

    runWithBusyGuard(async () => {
      const currentSnapshot = routeHistorySnapshotRef.current;
      if (currentSnapshot.index >= currentSnapshot.length - 1) return;

      const targetIndex = currentSnapshot.index + 1;
      const targetRoute = routeHistoryRef.current[targetIndex];
      commitRouteHistorySnapshot({
        index: targetIndex,
        length: currentSnapshot.length,
      });
      setHistoryNavigationDirection("forward");
      try {
        if (targetRoute === null) {
          await performNewSession(null, { recordHistory: false });
        } else {
          await performSelectThread(targetRoute, { recordHistory: false });
        }
      } finally {
        await waitForNextPaint();
        setHistoryNavigationDirection(null);
      }
    });
  }, [
    commitRouteHistorySnapshot,
    historyNavigationDirection,
    isNavigating,
    performNewSession,
    performSelectThread,
    runWithBusyGuard,
  ]);

  const canNavigateBack = routeHistorySnapshot.index > 0;
  const canNavigateForward =
    routeHistorySnapshot.index < routeHistorySnapshot.length - 1;

  return {
    isNavigating,
    isThreadContentReady,
    showThreadShellDuringNavigation,
    searchOverlay: {
      isOpen: isSearchOverlayOpen,
      mode: searchOverlayMode,
      pendingReveal: pendingSearchReveal,
    },
    openSearchOverlay,
    closeSearchOverlay,
    clearSearchReveal,
    performSelectThread,
    performNewSession,
    handleNavigation,
    revealSearchMatch,
    handleNewSession,
    canNavigateBack,
    canNavigateForward,
    historyNavigationDirection,
    navigateBack,
    navigateForward,
  };
};
