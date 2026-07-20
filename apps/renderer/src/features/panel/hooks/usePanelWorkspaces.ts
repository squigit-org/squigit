/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { platform as platformBridge } from "@/platform";
import type { PanelPoint, WorkspaceOrdering } from "../panel.types";
import {
  buildPanelWorkspaces,
  getVisiblePanelWorkspaces,
  isUnsafeWorkspacePath,
  orderPathWorkspaces,
} from "../panel.utils";

interface UsePanelWorkspacesOptions {
  activeSessionId: string | null;
  onNavigate?: () => void;
}

export const usePanelWorkspaces = ({
  activeSessionId,
  onNavigate,
}: UsePanelWorkspacesOptions) => {
  const app = useAppContext();
  const [workspaceOrdering, setWorkspaceOrdering] =
    useState<WorkspaceOrdering>("created");
  const [workspaceContextMenu, setWorkspaceContextMenu] =
    useState<PanelPoint | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<
    Set<string>
  >(() => new Set());
  const [didInitializeWorkspaceCollapse, setDidInitializeWorkspaceCollapse] =
    useState(false);
  const pendingWorkspaceCollapseRef = useRef<{
    id: string;
    wasCollapsed: boolean;
  } | null>(null);

  const workspaceItems = useMemo(
    () => buildPanelWorkspaces(app.threadHistory.workspaces),
    [app.threadHistory.workspaces],
  );
  const pathWorkspaces = useMemo(
    () => orderPathWorkspaces(workspaceItems, workspaceOrdering),
    [workspaceItems, workspaceOrdering],
  );
  const defaultWorkspace = useMemo(
    () => workspaceItems.find((workspace) => workspace.path === null) ?? null,
    [workspaceItems],
  );
  const activeWorkspaceId = useMemo(
    () =>
      activeSessionId
        ? (workspaceItems.find((workspace) =>
            workspace.threads.some((thread) => thread.id === activeSessionId),
          )?.id ?? null)
        : null,
    [activeSessionId, workspaceItems],
  );
  const visiblePathWorkspaces = useMemo(
    () => getVisiblePanelWorkspaces(pathWorkspaces, activeWorkspaceId),
    [activeWorkspaceId, pathWorkspaces],
  );

  const isHomeRoute = activeSessionId === null;
  const pendingWorkspaceId = app.threadHistory.pendingWorkspaceId;

  useEffect(() => {
    if (
      didInitializeWorkspaceCollapse ||
      app.threadHistory.isLoading ||
      workspaceItems.length === 0
    ) {
      return;
    }

    setCollapsedWorkspaceIds(
      new Set(
        workspaceItems
          .filter(
            (workspace) =>
              workspace.path !== null &&
              workspace.id !== pendingWorkspaceId &&
              workspace.id !== activeWorkspaceId,
          )
          .map((workspace) => workspace.id),
      ),
    );
    setDidInitializeWorkspaceCollapse(true);
  }, [
    activeWorkspaceId,
    app.threadHistory.isLoading,
    didInitializeWorkspaceCollapse,
    pendingWorkspaceId,
    workspaceItems,
  ]);

  useLayoutEffect(() => {
    if (!activeWorkspaceId) return;

    setCollapsedWorkspaceIds((current) => {
      if (!current.has(activeWorkspaceId)) return current;
      const next = new Set(current);
      next.delete(activeWorkspaceId);
      return next;
    });
  }, [activeWorkspaceId]);

  useLayoutEffect(() => {
    if (!pendingWorkspaceId || !isHomeRoute) return;

    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      const previous = pendingWorkspaceCollapseRef.current;

      if (previous && previous.id !== pendingWorkspaceId) {
        if (previous.wasCollapsed) next.add(previous.id);
        else next.delete(previous.id);
      }

      if (!previous || previous.id !== pendingWorkspaceId) {
        pendingWorkspaceCollapseRef.current = {
          id: pendingWorkspaceId,
          wasCollapsed: next.has(pendingWorkspaceId),
        };
      }

      next.delete(pendingWorkspaceId);
      return next;
    });
  }, [isHomeRoute, pendingWorkspaceId]);

  const cancelPendingThread = useCallback(() => {
    const previous = pendingWorkspaceCollapseRef.current;
    pendingWorkspaceCollapseRef.current = null;

    if (previous) {
      setCollapsedWorkspaceIds((current) => {
        const next = new Set(current);
        if (previous.wasCollapsed) next.add(previous.id);
        else next.delete(previous.id);
        return next;
      });
    }

    app.threadHistory.setPendingWorkspaceId(null);
  }, [app.threadHistory]);

  const consumePendingThread = useCallback(() => {
    pendingWorkspaceCollapseRef.current = null;
    app.threadHistory.setPendingWorkspaceId(null);
  }, [app.threadHistory]);

  const restorePendingWorkspaceCollapse = useCallback(
    (openedNewThread: boolean) => {
      const previous = pendingWorkspaceCollapseRef.current;
      pendingWorkspaceCollapseRef.current = null;
      if (!previous || openedNewThread) return;

      setCollapsedWorkspaceIds((current) => {
        const next = new Set(current);
        if (previous.wasCollapsed) next.add(previous.id);
        else next.delete(previous.id);
        return next;
      });
    },
    [],
  );

  const toggleWorkspace = useCallback((workspaceId: string) => {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  }, []);

  const toggleWorkspaceContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setWorkspaceContextMenu((current) =>
        current ? null : { x: rect.left, y: rect.bottom },
      );
    },
    [],
  );

  const closeWorkspaceContextMenu = useCallback(() => {
    setWorkspaceContextMenu(null);
  }, []);

  const collapseAllWorkspaces = useCallback(() => {
    setCollapsedWorkspaceIds(
      new Set(workspaceItems.map((workspace) => workspace.id)),
    );
  }, [workspaceItems]);

  const expandAllWorkspaces = useCallback(() => {
    setCollapsedWorkspaceIds(new Set());
  }, []);

  const createWorkspace = useCallback(async () => {
    try {
      const selected = await platformBridge.dialog.open({
        directory: true,
        title: "New Workspace",
        buttonLabel: "Select workspace",
      });
      if (!selected || Array.isArray(selected)) return;

      if (isUnsafeWorkspacePath(selected)) {
        setWorkspaceError(
          "Choose a dedicated workspace instead of a device, home, or system path.",
        );
        return;
      }

      const workspace = await app.threadHistory.handleCreateWorkspace(selected);
      setCollapsedWorkspaceIds((current) => new Set(current).add(workspace.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkspaceError(
        message.includes("already in use")
          ? "That workspace is already open."
          : "This path cannot be used as a workspace.",
      );
    }
  }, [app.threadHistory]);

  const openNewThread = useCallback(
    (workspaceId: string | null) => {
      if (app.isNavigating) return;
      onNavigate?.();
      app.handleNewSession(workspaceId);
    },
    [app.handleNewSession, app.isNavigating, onNavigate],
  );

  const clearWorkspaceUi = useCallback(() => {
    if (pendingWorkspaceId) cancelPendingThread();
    setWorkspaceContextMenu(null);
  }, [cancelPendingThread, pendingWorkspaceId]);

  return {
    activeWorkspaceId,
    cancelPendingThread,
    clearWorkspaceUi,
    closeWorkspaceContextMenu,
    collapsedWorkspaceIds,
    collapseAllWorkspaces,
    consumePendingThread,
    createWorkspace,
    defaultWorkspace,
    didInitializeWorkspaceCollapse,
    expandAllWorkspaces,
    isHomeRoute,
    isNavigating: app.isNavigating,
    openNewThread,
    pathWorkspaces,
    pendingWorkspaceId,
    restorePendingWorkspaceCollapse,
    setWorkspaceError,
    setWorkspaceOrdering,
    toggleWorkspace,
    toggleWorkspaceContextMenu,
    visiblePathWorkspaces,
    workspaceContextMenu,
    workspaceError,
    workspaceItems,
    workspaceOrdering,
  };
};
