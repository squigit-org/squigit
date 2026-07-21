/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  createWorkspace,
  deleteThread,
  listWorkspaces,
  setThreadWorkspace,
  type ThreadMetadata,
  type ThreadSearchResult,
  type WorkspaceMetadata,
  searchThreads as searchThreadsApi,
  updateThreadMetadata as updateThreadMeta,
} from "@squigit/core/config";
const SYSTEM_PREFIX = "__system_";
const isOnboardingId = (id: string) => id.startsWith(SYSTEM_PREFIX);
const TOUCH_THROTTLE_MS = 1200;

export const useThreadHistory = (activeProfileId: string | null = null) => {
  const [threads, setThreads] = useState<ThreadMetadata[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([]);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const threadsRef = useRef<ThreadMetadata[]>([]);
  const lastTouthreadRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const refreshThreads = useCallback(async () => {
    setIsLoading(true);
    try {
      const workspaceList = await listWorkspaces();
      const threadList = workspaceList.flatMap((workspace) =>
        Object.values(workspace.threads),
      );

      setWorkspaces(workspaceList);
      setThreads(threadList.filter((c) => !isOnboardingId(c.id)));
      setPendingWorkspaceId((current) =>
        current && workspaceList.some((workspace) => workspace.id === current)
          ? current
          : null,
      );
    } catch (e) {
      console.error("Failed to load workspaces:", e);
      setWorkspaces([]);
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeProfileId]);

  const updateWorkspaceThread = useCallback((updated: ThreadMetadata) => {
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.threads[updated.id]
          ? {
              ...workspace,
              threads: { ...workspace.threads, [updated.id]: updated },
            }
          : workspace,
      ),
    );
  }, []);

  const handleCreateWorkspace = useCallback(async (path: string) => {
    const workspace = await createWorkspace(path);
    setWorkspaces((current) => [
      workspace,
      ...current.filter((item) => item.id !== workspace.id),
    ]);
    return workspace;
  }, []);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    setActiveSessionId((prev) => (prev && isOnboardingId(prev) ? prev : null));
  }, [activeProfileId]);

  const handleDeleteThread = async (id: string) => {
    if (isOnboardingId(id)) return;
    try {
      await deleteThread(id);
      setThreads((prev) => prev.filter((c) => c.id !== id));
      setWorkspaces((current) =>
        current.map((workspace) => {
          if (!workspace.threads[id]) return workspace;
          const nextThreads = { ...workspace.threads };
          delete nextThreads[id];
          return { ...workspace, threads: nextThreads };
        }),
      );
      if (activeSessionId === id) {
        setActiveSessionId(null);
      }
    } catch (e) {
      console.error("Failed to delete thread:", e);
    }
  };

  const handleDeleteThreads = async (ids: string[]) => {
    const realIds = ids.filter((id) => !isOnboardingId(id));
    if (realIds.length === 0) return;
    try {
      await Promise.all(realIds.map((id) => deleteThread(id)));
      setThreads((prev) => prev.filter((c) => !realIds.includes(c.id)));
      const removedIds = new Set(realIds);
      setWorkspaces((current) =>
        current.map((workspace) => ({
          ...workspace,
          threads: Object.fromEntries(
            Object.entries(workspace.threads).filter(
              ([id]) => !removedIds.has(id),
            ),
          ),
        })),
      );
      if (activeSessionId && realIds.includes(activeSessionId)) {
        setActiveSessionId(null);
      }
    } catch (e) {
      console.error("Failed to delete threads:", e);
    }
  };

  const handleRenameThread = async (id: string, newTitle: string) => {
    if (isOnboardingId(id)) return;
    const thread = threads.find((c) => c.id === id);
    if (!thread) return;

    const updated = {
      ...thread,
      title: newTitle,
    };
    setThreads((prev) => prev.map((c) => (c.id === id ? updated : c)));
    updateWorkspaceThread(updated);
    try {
      await updateThreadMeta(updated);
    } catch (e) {
      console.error("Failed to rename thread:", e);
      setThreads((prev) => prev.map((c) => (c.id === id ? thread : c)));
      updateWorkspaceThread(thread);
    }
  };

  const handleTogglePinThread = async (id: string) => {
    if (isOnboardingId(id)) return;
    const thread = threads.find((c) => c.id === id);
    if (!thread) return;

    const updated = {
      ...thread,
      pinned_at: thread.pinned_at ? null : new Date().toISOString(),
    };

    setThreads((prev) => prev.map((c) => (c.id === id ? updated : c)));
    updateWorkspaceThread(updated);
    try {
      await updateThreadMeta(updated);
    } catch (e) {
      console.error("Failed to toggle pin:", e);
      setThreads((prev) => prev.map((c) => (c.id === id ? thread : c)));
      updateWorkspaceThread(thread);
    }
  };

  const handleMoveThread = useCallback(
    async (threadId: string, workspaceId: string) => {
      if (isOnboardingId(threadId)) return;

      await setThreadWorkspace(threadId, workspaceId);
      setWorkspaces((current) => {
        const sourceWorkspace = current.find(
          (workspace) => workspace.threads[threadId],
        );
        const destinationWorkspace = current.find(
          (workspace) => workspace.id === workspaceId,
        );
        const thread = sourceWorkspace?.threads[threadId];
        if (
          !sourceWorkspace ||
          !destinationWorkspace ||
          !thread ||
          sourceWorkspace.id === destinationWorkspace.id
        ) {
          return current;
        }

        return current.map((workspace) => {
          if (workspace.id === sourceWorkspace.id) {
            const nextThreads = { ...workspace.threads };
            delete nextThreads[threadId];
            return { ...workspace, threads: nextThreads };
          }
          if (workspace.id === destinationWorkspace.id) {
            return {
              ...workspace,
              threads: { ...workspace.threads, [threadId]: thread },
            };
          }
          return workspace;
        });
      });
    },
    [],
  );

  const touchThread = useCallback(async (id: string) => {
    if (isOnboardingId(id)) return;

    const now = Date.now();
    const lastTouchedAt = lastTouthreadRef.current.get(id) || 0;
    if (now - lastTouchedAt < TOUCH_THROTTLE_MS) {
      return;
    }
    lastTouthreadRef.current.set(id, now);

    const thread = threadsRef.current.find((c) => c.id === id);
    if (!thread) return;

    const updated = {
      ...thread,
      updated_at: new Date(now).toISOString(),
    };

    setThreads((prev) => prev.map((c) => (c.id === id ? updated : c)));
    updateWorkspaceThread(updated);

    try {
      await updateThreadMeta(updated);
    } catch (e) {
      console.error("Failed to touch thread metadata:", e);
    }
  }, []);

  const searchThreads = useCallback(
    async (query: string, limit = 60): Promise<ThreadSearchResult[]> => {
      try {
        return await searchThreadsApi(query, limit);
      } catch (e) {
        console.error("Failed to search threads:", e);
        return [];
      }
    },
    [],
  );

  return {
    threads,
    workspaces,
    pendingWorkspaceId,
    setPendingWorkspaceId,
    activeSessionId,
    setActiveSessionId,
    isLoading,
    refreshThreads,
    handleCreateWorkspace,
    handleDeleteThread,
    handleDeleteThreads,
    handleRenameThread,
    handleMoveThread,
    handleTogglePinThread,
    touchThread,
    searchThreads,
  };
};
