/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from "react";
import type { ThreadMetadata } from "@squigit/core/config";
import { useAppContext } from "@/app/providers/AppProvider";
import { getPanelThreads } from "../panel.utils";

export const usePanelSelection = (threads: ThreadMetadata[]) => {
  const app = useAppContext();
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const allThreads = useMemo(() => getPanelThreads(threads), [threads]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const enableSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  const closeSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const toggleThreadSelection = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((threadId) => threadId !== id)
        : [...current, id],
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds((current) =>
      current.length === allThreads.length
        ? []
        : allThreads.map((thread) => thread.id),
    );
  }, [allThreads]);

  const queueDeleteThread = useCallback((threadId: string) => {
    setDeleteThreadId(threadId);
  }, []);

  const confirmDeleteThread = useCallback(() => {
    if (!deleteThreadId) return;
    app.handleDeleteThreadWrapper(deleteThreadId);
    setDeleteThreadId(null);
  }, [app.handleDeleteThreadWrapper, deleteThreadId]);

  const confirmBulkDelete = useCallback(() => {
    app.handleDeleteThreadsWrapper(selectedIds);
    setSelectedIds([]);
    setIsSelectionMode(false);
    setShowBulkDelete(false);
  }, [app.handleDeleteThreadsWrapper, selectedIds]);

  return {
    allThreads,
    closeSelectionMode,
    confirmBulkDelete,
    confirmDeleteThread,
    deleteThreadId,
    enableSelectionMode,
    isSelectionMode,
    queueDeleteThread,
    selectAll,
    selectedIds,
    selectedIdSet,
    setDeleteThreadId,
    setShowBulkDelete,
    showBulkDelete,
    toggleThreadSelection,
  };
};
