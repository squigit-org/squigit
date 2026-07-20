/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MoreHorizontal,
  Pin,
  Trash2,
  Check,
  X,
  FolderOpenIcon,
  GitFork,
  Loader2,
  Settings,
  ChevronRight,
} from "lucide-react";

import { CustomizePanelIcon, NewThreadIcon } from "@/components/icons";
import { Dialog, LoadingSpinner, Tooltip } from "@/components/ui";
import { useKeyDown } from "@/hooks/shared";
import { platform as platformBridge } from "@/platform";
import {
  getDeleteMultipleThreadsDialog,
  formatCompactAge,
} from "@squigit/core/helpers";
import type { ThreadMetadata } from "@squigit/core/config";
import { ThreadContextMenu } from "../menus/ThreadContextMenu";
import {
  PanelContextMenu,
  type WorkspaceOrdering,
} from "../menus/PanelContextMenu";
import { useAppContext } from "../../providers/AppProvider";
import styles from "./SidePanel.module.css";

const Checkbox: React.FC<{ checked: boolean; onChange: () => void }> = ({
  checked,
  onChange,
}) => (
  <div
    className={`${styles.checkbox} ${checked ? styles.checked : ""}`}
    onClick={(e) => {
      e.stopPropagation();
      onChange();
    }}
  >
    {checked && (
      <Check size={10} className={styles.checkboxInner} strokeWidth={4} />
    )}
  </div>
);

interface TooltipButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip: string;
}

const TooltipButton: React.FC<TooltipButtonProps> = ({
  tooltip,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
  ...buttonProps
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
      <button
        {...buttonProps}
        ref={buttonRef}
        onMouseEnter={(event) => {
          setShowTooltip(true);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setShowTooltip(false);
          onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          setShowTooltip(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setShowTooltip(false);
          onBlur?.(event);
        }}
        onClick={(event) => {
          setShowTooltip(false);
          onClick?.(event);
        }}
      >
        {children}
      </button>
      <Tooltip
        text={tooltip}
        parentRef={buttonRef}
        show={showTooltip}
        above
      />
    </>
  );
};

const SYSTEM_PREFIX = "__system_";

const isUnsafeWorkspacePath = (path: string): boolean => {
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

interface ThreadItemProps {
  thread: ThreadMetadata;
  isActive: boolean;
  isEntering: boolean;
  isBusy: boolean;
  isForking: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  currentTime: number;
  menuState: { x: number; y: number } | null;
  onSelectThread: (threadId: string) => void;
  onToggleSelectionThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onTogglePinThread: (
    threadId: string,
    pointer: { x: number; y: number },
  ) => void;
  onLeaveThread: (pointer: { x: number; y: number }) => void;
  onForkThread: (threadId: string) => void;
  onOpenContextMenu: (id: string, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  onEnableSelectionMode: () => void;
}

const ThreadItem: React.FC<ThreadItemProps> = React.memo(
  ({
    thread,
    isActive,
    isEntering,
    isBusy,
    isForking,
    isSelectionMode,
    isSelected,
    currentTime,
    menuState,
    onSelectThread,
    onToggleSelectionThread,
    onDeleteThread,
    onRenameThread,
    onTogglePinThread,
    onLeaveThread,
    onForkThread,
    onOpenContextMenu,
    onCloseContextMenu,
    onEnableSelectionMode,
  }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(thread.title);
    const [showAgeTooltip, setShowAgeTooltip] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLSpanElement>(null);

    const showMenu = !!menuState;

    useEffect(() => {
      if (isRenaming && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isRenaming]);

    useEffect(() => {
      if (!isRenaming) {
        setRenameValue(thread.title);
      }
    }, [thread.title, isRenaming]);

    const handleMenuClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (showMenu) {
        onCloseContextMenu();
        return;
      }
      onOpenContextMenu(thread.id, e.clientX, e.clientY);
    };

    const handleRenameSubmit = () => {
      if (renameValue.trim() && renameValue !== thread.title) {
        onRenameThread(thread.id, renameValue.trim());
      }
      setIsRenaming(false);
    };

    const handleRenameKeyDown = useKeyDown({
      Enter: handleRenameSubmit,
      Escape: () => {
        setRenameValue(thread.title);
        setIsRenaming(false);
      },
    });

    const lastActivityAt = thread.updated_at || thread.created_at;
    const lastActivityLabel = formatCompactAge(lastActivityAt, currentTime);
    const lastActivityTitle = useMemo(
      () => new Date(lastActivityAt).toLocaleString(),
      [lastActivityAt],
    );

    return (
      <>
        <div
          className={`${styles.threadRow} ${thread.pinned_at ? styles.pinnedRow : ""} ${isActive ? styles.active : ""} ${isEntering ? styles.threadRowEntering : ""} ${showMenu ? styles.menuOpen : ""}`}
          onPointerLeave={(event) =>
            onLeaveThread({ x: event.clientX, y: event.clientY })
          }
          onClick={
            isSelectionMode
              ? () => onToggleSelectionThread(thread.id)
              : () => onSelectThread(thread.id)
          }
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenContextMenu(thread.id, e.clientX, e.clientY);
          }}
        >
          {isSelectionMode && (
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelectionThread(thread.id)}
            />
          )}

          {!isSelectionMode && <div style={{ paddingLeft: "16px" }}></div>}

          {isRenaming ? (
            <input
              ref={inputRef}
              className={styles.threadTitleInput}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleRenameKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={styles.threadTitle}
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsRenaming(true);
              }}
            >
              {thread.title}
            </span>
          )}

          {!isSelectionMode && (
            <div className={styles.threadActions}>
              {isBusy ? (
                <span className={styles.rowSpinner} aria-hidden="true">
                  <span className={styles.rowSpinnerInner}>
                    <LoadingSpinner />
                  </span>
                </span>
              ) : (
                <>
                  <span
                    ref={ageRef}
                    className={styles.threadDate}
                    onMouseEnter={() => setShowAgeTooltip(true)}
                    onMouseLeave={() => setShowAgeTooltip(false)}
                  >
                    {lastActivityLabel}
                  </span>
                  <Tooltip
                    text={lastActivityTitle}
                    parentRef={ageRef}
                    show={showAgeTooltip}
                    above
                  />
                </>
              )}
              <button
                type="button"
                className={`${styles.pinBtn} ${thread.pinned_at ? styles.pinActive : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTogglePinThread(thread.id, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <Pin size={15} style={{ transform: "rotate(45deg)" }} />
              </button>
              <button
                type="button"
                className={`${styles.forkBtn} ${isForking ? styles.forkBtnLoading : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isBusy && !isForking) onForkThread(thread.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                aria-label={isForking ? "Forking thread" : "Fork thread"}
                aria-busy={isForking}
              >
                {isForking ? (
                  <Loader2 size={14} className={styles.forkSpinner} />
                ) : (
                  <GitFork size={14} />
                )}
              </button>
              <button
                type="button"
                className={`${styles.actionRight}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={handleMenuClick}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          )}
        </div>

        {showMenu && menuState && (
          <ThreadContextMenu
            x={menuState.x}
            y={menuState.y}
            onClose={onCloseContextMenu}
            onRename={() => {
              setIsRenaming(true);
            }}
            onToggleSelection={() => {
              onEnableSelectionMode();
              if (!isSelected) {
                onToggleSelectionThread(thread.id);
              }
            }}
            onDelete={() => {
              onDeleteThread(thread.id);
            }}
            isSelected={isSelected}
          />
        )}
      </>
    );
  },
);

export const SidePanel: React.FC = () => {
  const app = useAppContext();
  const threads = app.threadHistory.threads;
  const activeSessionId = app.threadHistory.activeSessionId;

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [activeThreadContextMenu, setActiveThreadContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [panelContextMenu, setPanelContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [workspaceOrdering, setWorkspaceOrdering] =
    useState<WorkspaceOrdering>("created");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [didInitializeWorkspaceCollapse, setDidInitializeWorkspaceCollapse] =
    useState(false);
  const [enteringThreadIds, setEnteringThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [forkingThreadIds, setForkingThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isPinHoverFrozen, setIsPinHoverFrozen] = useState(false);
  const pinHoverFreezeOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pinHoverFreezeTimeoutRef = useRef<number | null>(null);
  const pendingWorkspaceCollapseRef = useRef<{
    id: string;
    wasCollapsed: boolean;
  } | null>(null);
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

  const workspaceItems = useMemo(
    () =>
      app.threadHistory.workspaces.map((workspace) => ({
        ...workspace,
        threads: Object.values(workspace.threads)
          .filter((thread) => !thread.id.startsWith(SYSTEM_PREFIX))
          .sort((a, b) => {
            if (a.pinned_at || b.pinned_at) {
              if (!a.pinned_at) return 1;
              if (!b.pinned_at) return -1;
              return (
                new Date(b.pinned_at).getTime() -
                new Date(a.pinned_at).getTime()
              );
            }
            return (
              new Date(b.updated_at || b.created_at).getTime() -
              new Date(a.updated_at || a.created_at).getTime()
            );
          }),
      })),
    [app.threadHistory.workspaces],
  );

  const pathWorkspaces = useMemo(
    () => {
      const workspaces = workspaceItems.filter(
        (workspace) => workspace.path !== null,
      );
      if (workspaceOrdering === "created") return workspaces;

      const updatedTime = (workspace: (typeof workspaceItems)[number]) =>
        workspace.threads.reduce(
          (latest, thread) =>
            Math.max(
              latest,
              new Date(thread.updated_at || thread.created_at).getTime(),
            ),
          0,
        );

      return workspaces.sort((a, b) => {
        return updatedTime(b) - updatedTime(a);
      });
    },
    [workspaceItems, workspaceOrdering],
  );
  const defaultWorkspace = useMemo(
    () => workspaceItems.find((workspace) => workspace.path === null) ?? null,
    [workspaceItems],
  );
  const visiblePathWorkspaces = pathWorkspaces.slice(0, 3);
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
              workspace.path !== null && workspace.id !== pendingWorkspaceId,
          )
          .map((workspace) => workspace.id),
      ),
    );
    setDidInitializeWorkspaceCollapse(true);
  }, [
    app.threadHistory.isLoading,
    didInitializeWorkspaceCollapse,
    pendingWorkspaceId,
    workspaceItems,
  ]);

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
    if (!isHomeRoute && !pendingWorkspaceId) {
      const previous = pendingWorkspaceCollapseRef.current;
      pendingWorkspaceCollapseRef.current = null;

      const openedNewThread = activeSessionId
        ? !knownThreadIdsRef.current.has(activeSessionId)
        : false;
      if (previous && !openedNewThread) {
        setCollapsedWorkspaceIds((current) => {
          const next = new Set(current);
          if (previous.wasCollapsed) next.add(previous.id);
          else next.delete(previous.id);
          return next;
        });
      }
    }
  }, [activeSessionId, isHomeRoute, pendingWorkspaceId]);

  const allThreads = useMemo(
    () => threads.filter((thread) => !thread.id.startsWith(SYSTEM_PREFIX)),
    [threads],
  );

  const isThreadBusy =
    app.thread.isAnalyzing ||
    app.thread.isGenerating ||
    app.thread.isAiTyping ||
    app.isOcrScanning;
  const busyThreadId = isThreadBusy ? activeSessionId : null;

  const handleOpenContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      const xPos = x + 180 > window.innerWidth ? x - 180 : x;
      setPanelContextMenu(null);
      setActiveThreadContextMenu((prev) => {
        if (prev && prev.id === id && prev.x === xPos && prev.y === y) {
          return prev;
        }
        return { id, x: xPos, y };
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setActiveThreadContextMenu((prev) => (prev === null ? prev : null));
  }, []);

  const handleTogglePin = useCallback(async (
    threadId: string,
    pointer: { x: number; y: number },
  ) => {
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
    }, 5_00);
    pinToggleLockRef.current.add(threadId);
    try {
      await togglePinRef.current(threadId);
    } finally {
      setTimeout(() => {
        pinToggleLockRef.current.delete(threadId);
      }, 220);
    }
  }, []);

  const handleLeaveThread = useCallback(
    (pointer: { x: number; y: number }) => {
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

  const handleForkThread = useCallback(
    async (threadId: string) => {
      if (forkThreadLockRef.current.has(threadId)) return;

      forkThreadLockRef.current.add(threadId);
      setForkingThreadIds((current) => new Set(current).add(threadId));
      try {
        await app.handleForkThread(threadId);
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
    [app.handleForkThread],
  );

  useEffect(
    () => () => {
      if (pinHoverFreezeTimeoutRef.current !== null) {
        window.clearTimeout(pinHoverFreezeTimeoutRef.current);
      }
    },
    [],
  );

  const handleNavigation = useCallback(
    (threadId: string) => {
      if (threadId === activeSessionId) return;
      if (pendingWorkspaceId) cancelPendingThread();
      selectThreadRef.current(threadId);
    },
    [activeSessionId, cancelPendingThread, pendingWorkspaceId],
  );

  const handleNewThread = useCallback(
    (workspaceId: string | null) => {
      app.handleNewSession(workspaceId);
    },
    [app],
  );

  const handleToggleWorkspace = useCallback((workspaceId: string) => {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  }, []);

  const handleTogglePanelContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setActiveThreadContextMenu(null);
      setPanelContextMenu((current) =>
        current ? null : { x: rect.left, y: rect.bottom },
      );
    },
    [],
  );

  const handleCollapseAllWorkspaces = useCallback(() => {
    setCollapsedWorkspaceIds(
      new Set(workspaceItems.map((workspace) => workspace.id)),
    );
  }, [workspaceItems]);

  const handleExpandAllWorkspaces = useCallback(() => {
    setCollapsedWorkspaceIds(new Set());
  }, []);

  const handleNewWorkspace = useCallback(async () => {
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

  const handleRenameThread = useCallback(
    (threadId: string, newTitle: string) => {
      renameThreadRef.current(threadId, newTitle);
    },
    [],
  );

  const handleEnableSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => !prev);
    setSelectedIds([]);
  }, []);

  const toggleThreadSelection = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }, []);

  const handleQueueDeleteThread = useCallback((threadId: string) => {
    setDeleteId(threadId);
  }, []);

  const selectAll = () => {
    setSelectedIds(
      selectedIds.length === allThreads.length
        ? []
        : allThreads.map((c) => c.id),
    );
  };

  const handleDeleteThread = () => {
    if (deleteId) {
      app.handleDeleteThreadWrapper(deleteId);
      setDeleteId(null);
    }
  };

  const handleBulkDelete = () => {
    app.handleDeleteThreadsWrapper(selectedIds);
    setSelectedIds([]);
    setIsSelectionMode(false);
    setShowBulkDelete(false);
  };

  const renderWorkspace = (workspace: (typeof workspaceItems)[number]) => {
    const isDefault = workspace.path === null;
    const isCollapsed = didInitializeWorkspaceCollapse
      ? collapsedWorkspaceIds.has(workspace.id)
      : !isDefault && workspace.id !== pendingWorkspaceId;
    const showPendingThread =
      !isDefault &&
      isHomeRoute &&
      pendingWorkspaceId === workspace.id;
    const showNewThreadButton = isDefault
      ? !isHomeRoute
      : !showPendingThread;
    return (
      <section className={styles.workspace} key={workspace.id}>
        <div
          className={styles.workspaceDivider}
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          onClick={() => handleToggleWorkspace(workspace.id)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            handleToggleWorkspace(workspace.id);
          }}
        >
          <ChevronRight
            size={15}
            className={`${styles.workspaceChevron} ${
              isCollapsed ? "" : styles.workspaceChevronExpanded
            }`}
          />
          <span className={styles.workspaceLabel}>
            {workspace.name}
          </span>
          <div className={styles.workspaceActions}>
            <div
              className={`${styles.workspaceThreadAction} ${
                showNewThreadButton ? styles.workspaceThreadActionEnabled : ""
              }`}
            >
              <TooltipButton
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleNewThread(isDefault ? null : workspace.id);
                }}
                className={`${styles.iconButton} ${styles.workspaceNewThreadButton}`}
                tooltip="New Thread"
                aria-label={`New thread in ${workspace.name}`}
                tabIndex={showNewThreadButton ? 0 : -1}
                aria-hidden={!showNewThreadButton}
              >
                <NewThreadIcon size={16} />
              </TooltipButton>
            </div>
          </div>
        </div>

        <div
          className={`${styles.workspaceThreads} ${
            isCollapsed ? styles.workspaceThreadsCollapsed : ""
          }`}
          aria-hidden={isCollapsed}
        >
          <div className={styles.workspaceThreadsClip}>
            <div className={styles.workspaceInner}>
              {showPendingThread && (
                <div
                  className={`${styles.threadRow} ${styles.pendingThreadRow}`}
                  aria-label={`New thread pending in ${workspace.name}`}
                >
                  <div className={styles.threadIndent} />
                  <span className={styles.threadTitle}>New thread</span>
                  <TooltipButton
                    type="button"
                    className={styles.pendingThreadClose}
                    onClick={cancelPendingThread}
                    tooltip="Cancel new thread"
                    aria-label={`Cancel new thread in ${workspace.name}`}
                  >
                    <X size={14} />
                  </TooltipButton>
                </div>
              )}

              {workspace.threads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={thread.id === activeSessionId}
                  isEntering={enteringThreadIds.has(thread.id)}
                  isBusy={busyThreadId === thread.id}
                  isForking={forkingThreadIds.has(thread.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIdSet.has(thread.id)}
                  currentTime={currentTime}
                  menuState={
                    activeThreadContextMenu?.id === thread.id
                      ? activeThreadContextMenu
                      : null
                  }
                  onSelectThread={handleNavigation}
                  onToggleSelectionThread={toggleThreadSelection}
                  onDeleteThread={handleQueueDeleteThread}
                  onRenameThread={handleRenameThread}
                  onTogglePinThread={handleTogglePin}
                  onLeaveThread={handleLeaveThread}
                  onForkThread={handleForkThread}
                  onOpenContextMenu={handleOpenContextMenu}
                  onCloseContextMenu={handleCloseContextMenu}
                  onEnableSelectionMode={handleEnableSelectionMode}
                />
              ))}

              {workspace.threads.length === 0 && !showPendingThread && (
                <div className={styles.emptyState}>No threads yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div
      className={`${styles.panel} ${
        isPinHoverFrozen ? styles.pinHoverFrozen : ""
      }`}
    >
      {isSelectionMode ? (
        <div className={styles.selectionHeader}>
          <div className={styles.selectionLeft}>
            <Checkbox
              checked={
                selectedIds.length === allThreads.length &&
                allThreads.length > 0
              }
              onChange={selectAll}
            />
            <span className={styles.labelAll}>All</span>
          </div>

          <div className={styles.selectionCenter}>
            <span className={styles.selectionCount}>
              {selectedIds.length} selected
            </span>
          </div>

          <div className={styles.selectionRight}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.danger}`}
              onClick={() => selectedIds.length > 0 && setShowBulkDelete(true)}
              disabled={selectedIds.length === 0}
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={toggleSelectionMode}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.headerArea}>Squigit</div>
      )}

      <div className={styles.scrollArea}>
        <div className={styles.workspacesHeader}>
          <span className={styles.workspacesTitle}>Workspaces</span>
          <div className={styles.workspacesHeaderActions}>
            <TooltipButton
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleTogglePanelContextMenu}
              className={styles.iconButton}
              tooltip="Customize workspaces"
              aria-label="Customize workspaces"
              aria-expanded={!!panelContextMenu}
            >
              <CustomizePanelIcon
                size={16}
                className={`${styles.customizePanelIcon} ${
                  panelContextMenu ? styles.customizePanelIconOpen : ""
                }`}
              />
            </TooltipButton>
            <TooltipButton
              type="button"
              onClick={() => {
                if (pendingWorkspaceId) cancelPendingThread();
                setPanelContextMenu(null);
              }}
              className={styles.iconButton}
              tooltip="Workspace settings"
              aria-label="Workspace settings"
            >
              <Settings size={16} />
            </TooltipButton>
            <TooltipButton
              type="button"
              onClick={handleNewWorkspace}
              className={styles.iconButton}
              tooltip="Add workspace"
              aria-label="Add workspace"
            >
              <FolderOpenIcon size={17} />
            </TooltipButton>
          </div>
        </div>

        {visiblePathWorkspaces.map(renderWorkspace)}

        {pathWorkspaces.length > 3 && (
          <div className={styles.viewAllDivider}>
            <span className={styles.viewAllLine} />
            <button
              type="button"
              className={styles.viewAllButton}
              onClick={() => app.openSearchOverlay("workspaces")}
            >
              View all ({pathWorkspaces.length})
            </button>
            <span className={styles.viewAllLine} />
          </div>
        )}

        {defaultWorkspace && renderWorkspace(defaultWorkspace)}
      </div>

      {panelContextMenu && (
        <PanelContextMenu
          x={panelContextMenu.x}
          y={panelContextMenu.y}
          onClose={() => setPanelContextMenu(null)}
          ordering={workspaceOrdering}
          onChangeOrdering={setWorkspaceOrdering}
          onCollapseAll={handleCollapseAllWorkspaces}
          onExpandAll={handleExpandAllWorkspaces}
        />
      )}

      <Dialog
        isOpen={!!deleteId}
        type="DELETE_THREAD"
        onAction={(key) => {
          if (key === "confirm") handleDeleteThread();
          else setDeleteId(null);
        }}
      />

      <Dialog
        isOpen={showBulkDelete}
        type={getDeleteMultipleThreadsDialog(selectedIds.length)}
        onAction={(key) => {
          if (key === "confirm") handleBulkDelete();
          else setShowBulkDelete(false);
        }}
      />

      <Dialog
        isOpen={!!workspaceError}
        variant="warning"
        title="Workspace unavailable"
        message={workspaceError || ""}
        actions={[
          {
            label: "Close",
            variant: "primary",
            onClick: () => setWorkspaceError(null),
          },
        ]}
      />
    </div>
  );
};
