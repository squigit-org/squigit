/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
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
  Search,
  FolderOpen,
  ArrowUpRight,
} from "lucide-react";

import {
  SidePanelNewThreadIcon,
  SidePanelSquigitsIcon,
} from "@/components/icons";
import { Dialog, LoadingSpinner } from "@/components/ui";
import { useKeyDown, usePlatform } from "@/hooks/shared";
import { getDeleteMultipleThreadsDialog } from "@squigit/core/helpers";
import type { ThreadMetadata } from "@squigit/core/config";
import { PanelContextMenu } from "../menus/PanelContextMenu";
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

const SYSTEM_PREFIX = "__system_";

const formatThreadAge = (isoDate: string, now = Date.now()): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";

  const elapsedMs = Math.max(0, now - parsed.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (elapsedMs >= year) return `${Math.floor(elapsedMs / year)}y`;
  if (elapsedMs >= month) return `${Math.floor(elapsedMs / month)}m`;
  if (elapsedMs >= day) return `${Math.floor(elapsedMs / day)}d`;
  if (elapsedMs >= hour) return `${Math.floor(elapsedMs / hour)}h`;
  return `${Math.max(1, Math.floor(elapsedMs / minute))}m`;
};

interface ThreadItemProps {
  thread: ThreadMetadata;
  isActive: boolean;
  isBusy: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  currentTime: number;
  menuState: { x: number; y: number } | null;
  onSelectThread: (threadId: string) => void;
  onToggleSelectionThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onTogglePinThread: (threadId: string) => void;
  onOpenContextMenu: (id: string, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  onEnableSelectionMode: () => void;
}

const ThreadItem: React.FC<ThreadItemProps> = React.memo(
  ({
    thread,
    isActive,
    isBusy,
    isSelectionMode,
    isSelected,
    currentTime,
    menuState,
    onSelectThread,
    onToggleSelectionThread,
    onDeleteThread,
    onRenameThread,
    onTogglePinThread,
    onOpenContextMenu,
    onCloseContextMenu,
    onEnableSelectionMode,
  }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(thread.title);
    const inputRef = useRef<HTMLInputElement>(null);

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
    const lastActivityLabel = formatThreadAge(lastActivityAt, currentTime);
    const lastActivityTitle = useMemo(
      () => new Date(lastActivityAt).toLocaleString(),
      [lastActivityAt],
    );

    return (
      <>
        <div
          className={`${styles.threadRow} ${thread.is_pinned ? styles.pinnedRow : ""} ${isActive ? styles.active : ""} ${showMenu ? styles.menuOpen : ""}`}
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

          {!isSelectionMode && (
            <div
              className={styles.threadLeading}
              style={{ paddingLeft: "2px" }}
            >
              {isBusy ? (
                <span className={styles.rowSpinner} aria-hidden="true">
                  <span className={styles.rowSpinnerInner}>
                    <LoadingSpinner />
                  </span>
                </span>
              ) : (
                <>
                  <FolderOpen
                    size={20}
                    strokeWidth={1.5}
                    className={styles.threadIcon}
                  />
                  <button
                    type="button"
                    className={`${styles.pinBtn} ${thread.is_pinned ? styles.pinActive : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePinThread(thread.id);
                    }}
                    title={thread.is_pinned ? "Unpin" : "Pin"}
                  >
                    <Pin size={17} style={{ transform: "rotate(45deg)" }} />
                  </button>
                </>
              )}
            </div>
          )}

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
              {thread.is_pinned && (
                <span className={styles.threadDate} title={lastActivityTitle}>
                  {lastActivityLabel}
                </span>
              )}

              <button
                type="button"
                className={`${styles.menuBtn} ${thread.is_pinned ? styles.pinnedMenuBtn : ""}`}
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
          <PanelContextMenu
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
  const platform = usePlatform();
  const threads = app.threadHistory.threads;
  const activeSessionId = app.threadHistory.activeSessionId;

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [activeContextMenu, setActiveContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const pinToggleLockRef = useRef<Set<string>>(new Set());
  const selectThreadRef = useRef(app.handleSelectThread);
  const renameThreadRef = useRef(app.threadHistory.handleRenameThread);
  const togglePinRef = useRef(app.threadHistory.handleTogglePinThread);

  useEffect(() => {
    selectThreadRef.current = app.handleSelectThread;
    renameThreadRef.current = app.threadHistory.handleRenameThread;
    togglePinRef.current = app.threadHistory.handleTogglePinThread;
  }, [
    app.handleSelectThread,
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

  const { pinnedThreads, threadThreads, allThreads } = useMemo(() => {
    const sortedThreads = threads
      .filter((c: any) => !c.id.startsWith(SYSTEM_PREFIX))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime(),
      );

    return {
      pinnedThreads: sortedThreads.filter((thread) => thread.is_pinned),
      threadThreads: sortedThreads.filter((thread) => !thread.is_pinned),
      allThreads: sortedThreads,
    };
  }, [threads]);

  const isThreadBusy =
    app.thread.isAnalyzing ||
    app.thread.isGenerating ||
    app.thread.isAiTyping ||
    app.isOcrScanning;
  const busyThreadId = isThreadBusy ? activeSessionId : null;

  const searchShortcutLabel = useMemo(() => {
    if (platform.isMac) {
      return `${platform.modSymbol}K`;
    }
    return `${platform.modSymbol} + K`;
  }, [platform.isMac, platform.modSymbol]);

  const newThreadShortcutLabel = useMemo(() => {
    if (platform.isMac) {
      return `${platform.modSymbol}${platform.shiftSymbol}O`;
    }
    return `${platform.modSymbol} + Shift + O`;
  }, [platform.isMac, platform.modSymbol, platform.shiftSymbol]);

  const handleOpenContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      const xPos = x + 180 > window.innerWidth ? x - 180 : x;
      setActiveContextMenu((prev) => {
        if (prev && prev.id === id && prev.x === xPos && prev.y === y) {
          return prev;
        }
        return { id, x: xPos, y };
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setActiveContextMenu((prev) => (prev === null ? prev : null));
  }, []);

  const handleTogglePin = useCallback(async (threadId: string) => {
    if (pinToggleLockRef.current.has(threadId)) return;

    pinToggleLockRef.current.add(threadId);
    try {
      await togglePinRef.current(threadId);
    } finally {
      setTimeout(() => {
        pinToggleLockRef.current.delete(threadId);
      }, 220);
    }
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      if (threadId === activeSessionId) return;
      selectThreadRef.current(threadId);
    },
    [activeSessionId],
  );

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

  return (
    <div className={styles.panel}>
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
        <div className={styles.headerArea}>
          <div className={styles.groupContent}>
            <div className={styles.groupInner}>
              <div className={styles.threadRow} onClick={app.handleNewSession}>
                <div
                  className={styles.threadIconMain}
                  style={{ paddingLeft: "2px" }}
                >
                  <SidePanelNewThreadIcon size={18} />
                </div>
                <span className={styles.threadTitle}>New thread</span>
                <div className={styles.rowShortcut} aria-hidden="true">
                  <span className={styles.rowShortcutText}>
                    {newThreadShortcutLabel}
                  </span>
                </div>
              </div>

              <div
                className={`${styles.threadRow} ${app.searchOverlay.isOpen ? styles.active : ""}`}
                onClick={app.openSearchOverlay}
              >
                <div
                  className={styles.threadIconMain}
                  style={{ paddingLeft: "1px" }}
                >
                  <Search size={19} />
                </div>
                <span className={styles.threadTitle}>Search threads</span>
                <div className={styles.rowShortcut} aria-hidden="true">
                  <span className={styles.rowShortcutText}>
                    {searchShortcutLabel}
                  </span>
                </div>
              </div>

              <div
                className={`${styles.threadRow} ${activeSessionId === "__system_gallery" ? styles.active : ""}`}
                onClick={() => app.handleSelectThread("__system_gallery")}
              >
                <div className={styles.threadIconMain}>
                  <SidePanelSquigitsIcon size={22} />
                </div>
                <span className={styles.threadTitle}>Your squigits</span>
                <div className={styles.rowShortcut} aria-hidden="true">
                  <ArrowUpRight size={14} className={styles.rowShortcutIcon} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.scrollArea}>
        {pinnedThreads.length > 0 && (
          <div className={styles.groupInner}>
            {pinnedThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeSessionId}
                isBusy={busyThreadId === thread.id}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIdSet.has(thread.id)}
                currentTime={currentTime}
                menuState={
                  activeContextMenu?.id === thread.id ? activeContextMenu : null
                }
                onSelectThread={handleSelectThread}
                onToggleSelectionThread={toggleThreadSelection}
                onDeleteThread={handleQueueDeleteThread}
                onRenameThread={handleRenameThread}
                onTogglePinThread={handleTogglePin}
                onOpenContextMenu={handleOpenContextMenu}
                onCloseContextMenu={handleCloseContextMenu}
                onEnableSelectionMode={handleEnableSelectionMode}
              />
            ))}
          </div>
        )}

        <div className={styles.threadsDivider}>
          <span>Threads</span>
        </div>

        <div className={styles.groupInner}>
          {threadThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeSessionId}
              isBusy={busyThreadId === thread.id}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIdSet.has(thread.id)}
              currentTime={currentTime}
              menuState={
                activeContextMenu?.id === thread.id ? activeContextMenu : null
              }
              onSelectThread={handleSelectThread}
              onToggleSelectionThread={toggleThreadSelection}
              onDeleteThread={handleQueueDeleteThread}
              onRenameThread={handleRenameThread}
              onTogglePinThread={handleTogglePin}
              onOpenContextMenu={handleOpenContextMenu}
              onCloseContextMenu={handleCloseContextMenu}
              onEnableSelectionMode={handleEnableSelectionMode}
            />
          ))}

          {threadThreads.length === 0 && (
            <div className={styles.emptyState}>No threads yet.</div>
          )}
        </div>
      </div>

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
    </div>
  );
};
