/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import type {
  PanelPoint,
  PanelThreadMenuState,
  PanelWorkspace,
} from "../panel.types";

interface UsePanelThreadsOptions {
  activeSessionId: string | null;
  cancelPendingThread: () => void;
  closeWorkspaceContextMenu: () => void;
  consumePendingThread: () => void;
  isHomeRoute: boolean;
  onNavigate?: () => void;
  pendingWorkspaceId: string | null;
  restorePendingWorkspaceCollapse: (openedNewThread: boolean) => void;
  workspaceItems: PanelWorkspace[];
}

export const usePanelThreads = ({
  activeSessionId,
  cancelPendingThread,
  closeWorkspaceContextMenu,
  consumePendingThread,
  isHomeRoute,
  onNavigate,
  pendingWorkspaceId,
  restorePendingWorkspaceCollapse,
  workspaceItems,
}: UsePanelThreadsOptions) => {
  const app = useAppContext();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [activeThreadContextMenu, setActiveThreadContextMenu] =
    useState<PanelThreadMenuState | null>(null);
  const [enteringThreadIds, setEnteringThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [forkingThreadIds, setForkingThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isPinHoverFrozen, setIsPinHoverFrozen] = useState(false);

  const pinHoverFreezeOriginRef = useRef<PanelPoint | null>(null);
  const pinHoverFreezeTimeoutRef = useRef<number | null>(null);
  const didInitializeThreadIdsRef = useRef(false);
  const knownThreadIdsRef = useRef<Set<string>>(new Set());
  const threadEntryTimeoutsRef = useRef<Map<string, number>>(new Map());
  const pinToggleLockRef = useRef<Set<string>>(new Set());
  const forkThreadLockRef = useRef<Set<string>>(new Set());
  const selectThreadRef = useRef(app.handleNavigation);
  const renameThreadRef = useRef(app.threadHistory.handleRenameThread);
  const togglePinRef = useRef(app.threadHistory.handleTogglePinThread);

  useEffect(() => {
    selectThreadRef.current = app.handleNavigation;
    renameThreadRef.current = app.threadHistory.handleRenameThread;
    togglePinRef.current = app.threadHistory.handleTogglePinThread;
  }, [
    app.handleNavigation,
    app.threadHistory.handleRenameThread,
    app.threadHistory.handleTogglePinThread,
  ]);

  useEffect(() => {
    const syncCurrentTime = () => setCurrentTime(Date.now());
    const intervalId = window.setInterval(syncCurrentTime, 30_000);

    window.addEventListener("focus", syncCurrentTime);
    document.addEventListener("visibilitychange", syncCurrentTime);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncCurrentTime);
      document.removeEventListener("visibilitychange", syncCurrentTime);
    };
  }, []);

  useEffect(() => {
    const nextThreadIds = new Set(
      workspaceItems.flatMap((workspace) =>
        workspace.threads.map((thread) => thread.id),
      ),
    );

    if (!didInitializeThreadIdsRef.current) {
      if (app.threadHistory.isLoading || workspaceItems.length === 0) return;
      didInitializeThreadIdsRef.current = true;
      knownThreadIdsRef.current = nextThreadIds;
      return;
    }

    const addedThreadIds = [...nextThreadIds].filter(
      (threadId) => !knownThreadIdsRef.current.has(threadId),
    );
    knownThreadIdsRef.current = nextThreadIds;
    if (addedThreadIds.length === 0) return;

    setEnteringThreadIds((current) => {
      const next = new Set(current);
      addedThreadIds.forEach((threadId) => next.add(threadId));
      return next;
    });

    addedThreadIds.forEach((threadId) => {
      const existingTimeout = threadEntryTimeoutsRef.current.get(threadId);
      if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
      const timeout = window.setTimeout(() => {
        threadEntryTimeoutsRef.current.delete(threadId);
        setEnteringThreadIds((current) => {
          if (!current.has(threadId)) return current;
          const next = new Set(current);
          next.delete(threadId);
          return next;
        });
      }, 240);
      threadEntryTimeoutsRef.current.set(threadId, timeout);
    });

    if (pendingWorkspaceId) consumePendingThread();
  }, [
    app.threadHistory.isLoading,
    consumePendingThread,
    pendingWorkspaceId,
    workspaceItems,
  ]);

  useEffect(
    () => () => {
      threadEntryTimeoutsRef.current.forEach((timeout) =>
        window.clearTimeout(timeout),
      );
      threadEntryTimeoutsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (isHomeRoute || pendingWorkspaceId) return;

    const openedNewThread = activeSessionId
      ? !knownThreadIdsRef.current.has(activeSessionId)
      : false;
    restorePendingWorkspaceCollapse(openedNewThread);
  }, [
    activeSessionId,
    isHomeRoute,
    pendingWorkspaceId,
    restorePendingWorkspaceCollapse,
  ]);

  const isThreadBusy =
    app.thread.isAnalyzing ||
    app.thread.isGenerating ||
    app.thread.isAiTyping ||
    app.isOcrScanning;
  const busyThreadId = isThreadBusy ? activeSessionId : null;

  const openContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      const xPos = x + 180 > window.innerWidth ? x - 180 : x;
      closeWorkspaceContextMenu();
      setActiveThreadContextMenu((current) => {
        if (
          current &&
          current.id === id &&
          current.x === xPos &&
          current.y === y
        ) {
          return current;
        }
        return { id, x: xPos, y };
      });
    },
    [closeWorkspaceContextMenu],
  );

  const closeContextMenu = useCallback(() => {
    setActiveThreadContextMenu((current) =>
      current === null ? current : null,
    );
  }, []);

  const togglePin = useCallback(
    async (threadId: string, pointer: PanelPoint) => {
      if (pinToggleLockRef.current.has(threadId)) return;

      pinHoverFreezeOriginRef.current = pointer;
      setIsPinHoverFrozen(true);
      if (pinHoverFreezeTimeoutRef.current !== null) {
        window.clearTimeout(pinHoverFreezeTimeoutRef.current);
      }
      pinHoverFreezeTimeoutRef.current = window.setTimeout(() => {
        pinHoverFreezeTimeoutRef.current = null;
        pinHoverFreezeOriginRef.current = null;
        setIsPinHoverFrozen(false);
      }, 500);
      pinToggleLockRef.current.add(threadId);

      try {
        await togglePinRef.current(threadId);
      } finally {
        window.setTimeout(() => {
          pinToggleLockRef.current.delete(threadId);
        }, 220);
      }
    },
    [],
  );

  const leaveThread = useCallback(
    (pointer: PanelPoint) => {
      if (!isPinHoverFrozen) return;
      const origin = pinHoverFreezeOriginRef.current;
      if (origin && origin.x === pointer.x && origin.y === pointer.y) return;

      if (pinHoverFreezeTimeoutRef.current !== null) {
        window.clearTimeout(pinHoverFreezeTimeoutRef.current);
        pinHoverFreezeTimeoutRef.current = null;
      }
      pinHoverFreezeOriginRef.current = null;
      setIsPinHoverFrozen(false);
    },
    [isPinHoverFrozen],
  );

  const forkThread = useCallback(
    async (threadId: string) => {
      if (forkThreadLockRef.current.has(threadId)) return;

      forkThreadLockRef.current.add(threadId);
      setForkingThreadIds((current) => new Set(current).add(threadId));
      try {
        await app.handleForkThread(threadId);
        onNavigate?.();
      } catch {
        // The app-level handler reports the storage/navigation error.
      } finally {
        forkThreadLockRef.current.delete(threadId);
        setForkingThreadIds((current) => {
          const next = new Set(current);
          next.delete(threadId);
          return next;
        });
      }
    },
    [app.handleForkThread, onNavigate],
  );

  useEffect(
    () => () => {
      if (pinHoverFreezeTimeoutRef.current !== null) {
        window.clearTimeout(pinHoverFreezeTimeoutRef.current);
      }
    },
    [],
  );

  const navigateToThread = useCallback(
    (threadId: string) => {
      if (threadId === activeSessionId) {
        onNavigate?.();
        return;
      }
      if (pendingWorkspaceId) cancelPendingThread();
      selectThreadRef.current(threadId);
      onNavigate?.();
    },
    [activeSessionId, cancelPendingThread, onNavigate, pendingWorkspaceId],
  );

  const renameThread = useCallback((threadId: string, newTitle: string) => {
    renameThreadRef.current(threadId, newTitle);
  }, []);

  return {
    activeThreadContextMenu,
    busyThreadId,
    closeContextMenu,
    currentTime,
    enteringThreadIds,
    forkingThreadIds,
    forkThread,
    isPinHoverFrozen,
    isThreadBusy,
    leaveThread,
    navigateToThread,
    openContextMenu,
    renameThread,
    togglePin,
  };
};
