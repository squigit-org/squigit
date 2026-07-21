/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ThreadMetadata,
  WorkspaceMetadata,
} from "@squigit/core/config";
import type { PanelWorkspace, WorkspaceOrdering } from "./panel.types";

export const SYSTEM_THREAD_PREFIX = "__system_";

const threadActivityTime = (thread: ThreadMetadata) =>
  new Date(thread.updated_at || thread.created_at).getTime();

const threadOrderingTime = (
  thread: ThreadMetadata,
  ordering: WorkspaceOrdering,
) =>
  new Date(
    ordering === "created"
      ? thread.created_at
      : thread.updated_at || thread.created_at,
  ).getTime();

export const sortPanelThreads = (
  threads: ThreadMetadata[],
  ordering: WorkspaceOrdering,
) =>
  [...threads].sort((a, b) => {
    if (a.pinned_at || b.pinned_at) {
      if (!a.pinned_at) return 1;
      if (!b.pinned_at) return -1;
      return (
        new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime()
      );
    }

    return threadOrderingTime(b, ordering) - threadOrderingTime(a, ordering);
  });

export const getPanelThreads = (threads: ThreadMetadata[]) =>
  threads.filter((thread) => !thread.id.startsWith(SYSTEM_THREAD_PREFIX));

export const buildPanelWorkspaces = (
  workspaces: WorkspaceMetadata[],
  ordering: WorkspaceOrdering,
): PanelWorkspace[] =>
  workspaces.map((workspace) => ({
    ...workspace,
    threads: sortPanelThreads(
      getPanelThreads(Object.values(workspace.threads)),
      ordering,
    ),
  }));

export const orderPathWorkspaces = (
  workspaces: PanelWorkspace[],
  ordering: WorkspaceOrdering,
) => {
  const pathWorkspaces = workspaces.filter(
    (workspace) => workspace.path !== null,
  );
  if (ordering === "created") return pathWorkspaces;

  const lastUpdatedAt = (workspace: PanelWorkspace) =>
    workspace.threads.reduce(
      (latest, thread) => Math.max(latest, threadActivityTime(thread)),
      0,
    );

  return pathWorkspaces.sort(
    (a, b) => lastUpdatedAt(b) - lastUpdatedAt(a),
  );
};

export const getVisiblePanelWorkspaces = (
  workspaces: PanelWorkspace[],
  activeWorkspaceId: string | null,
) => {
  const visible = workspaces.slice(0, 3);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  if (
    !activeWorkspace ||
    visible.some((workspace) => workspace.id === activeWorkspace.id)
  ) {
    return visible;
  }

  return [activeWorkspace, ...visible].slice(0, 3);
};

export const isUnsafeWorkspacePath = (path: string): boolean => {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized) return true;

  const windowsPath = normalized.replace(/\//g, "\\").toLowerCase();
  if (/^[a-z]:$/.test(windowsPath)) return true;
  if (
    /^[a-z]:\\(windows|users|program files|program files \(x86\)|programdata)$/i.test(
      windowsPath,
    )
  ) {
    return true;
  }

  const posixPath = normalized.replace(/\\/g, "/").toLowerCase();
  return new Set([
    "/",
    "/applications",
    "/library",
    "/system",
    "/users",
    "/volumes",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/home",
    "/lib",
    "/lib64",
    "/opt",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
  ]).has(posixPath);
};
