/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  createProject,
  deleteThread,
  listProjects,
  type ProjectMetadata,
  type ThreadMetadata,
  type ThreadSearchResult,
  searchThreads as searchThreadsApi,
  updateThreadMetadata as updateThreadMeta,
} from "@squigit/core/config";
const SYSTEM_PREFIX = "__system_";
const isOnboardingId = (id: string) => id.startsWith(SYSTEM_PREFIX);
const TOUCH_THROTTLE_MS = 1200;

export const useThreadHistory = (activeProfileId: string | null = null) => {
  const [threads, setThreads] = useState<ThreadMetadata[]>([]);
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
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
      const projectList = await listProjects();
      const threadList = projectList.flatMap((project) =>
        Object.values(project.threads),
      );

      setProjects(projectList);
      setThreads(threadList.filter((c) => !isOnboardingId(c.id)));
      setActiveProjectId((current) =>
        current && projectList.some((project) => project.id === current)
          ? current
          : (projectList[0]?.id ?? null),
      );
    } catch (e) {
      console.error("Failed to load projects:", e);
      setProjects([]);
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeProfileId]);

  const updateProjectThread = useCallback((updated: ThreadMetadata) => {
    setProjects((current) =>
      current.map((project) =>
        project.threads[updated.id]
          ? {
              ...project,
              threads: { ...project.threads, [updated.id]: updated },
            }
          : project,
      ),
    );
  }, []);

  const handleCreateProject = useCallback(async (path: string) => {
    const project = await createProject(path);
    setProjects((current) => [
      project,
      ...current.filter((item) => item.id !== project.id),
    ]);
    setActiveProjectId(project.id);
    return project;
  }, []);

  const getProjectIdForThread = useCallback(
    (threadId: string) =>
      projects.find((project) => !!project.threads[threadId])?.id ?? null,
    [projects],
  );

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
      setProjects((current) =>
        current.map((project) => {
          if (!project.threads[id]) return project;
          const nextThreads = { ...project.threads };
          delete nextThreads[id];
          return { ...project, threads: nextThreads };
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
      setProjects((current) =>
        current.map((project) => ({
          ...project,
          threads: Object.fromEntries(
            Object.entries(project.threads).filter(
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
    updateProjectThread(updated);
    try {
      await updateThreadMeta(updated);
    } catch (e) {
      console.error("Failed to rename thread:", e);
      setThreads((prev) => prev.map((c) => (c.id === id ? thread : c)));
      updateProjectThread(thread);
    }
  };

  const handleTogglePinThread = async (id: string) => {
    if (isOnboardingId(id)) return;
    const thread = threads.find((c) => c.id === id);
    if (!thread) return;

    const newPinnedState = !thread.is_pinned;
    const updated = {
      ...thread,
      is_pinned: newPinnedState,
    };

    setThreads((prev) => prev.map((c) => (c.id === id ? updated : c)));
    updateProjectThread(updated);
    try {
      await updateThreadMeta(updated);
    } catch (e) {
      console.error("Failed to toggle pin:", e);
      setThreads((prev) => prev.map((c) => (c.id === id ? thread : c)));
      updateProjectThread(thread);
    }
  };

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
    updateProjectThread(updated);

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
    projects,
    activeProjectId,
    setActiveProjectId,
    activeSessionId,
    setActiveSessionId,
    isLoading,
    refreshThreads,
    handleCreateProject,
    getProjectIdForThread,
    handleDeleteThread,
    handleDeleteThreads,
    handleRenameThread,
    handleTogglePinThread,
    touchThread,
    searchThreads,
  };
};
