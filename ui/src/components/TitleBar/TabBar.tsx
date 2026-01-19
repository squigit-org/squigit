/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Plus, X, Settings } from "lucide-react";
import { ChatSession } from "../../features/chat/types/chat.types";
import { TabContextMenu } from "./TabContextMenu";
import styles from "./TabBar.module.css";

const MAX_VISIBLE_TABS = 5;

interface TabProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isClosing?: boolean;
  isNew?: boolean;

  // Drag props
  isFloating?: boolean;
  isPlaceholder?: boolean;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent) => void;
}

const Tab: React.FC<TabProps> = ({
  session,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  isClosing,
  isNew,
  isFloating,
  isPlaceholder,
  style,
  onPointerDown,
}) => {
  const isSettingsTab = session.type === "settings";

  // If placeholder, we just need the dimensions, content invisible
  if (isPlaceholder) {
    return (
      <div className={`${styles.tab} ${styles.tabPlaceholder}`} style={style}>
        <span className={styles.tabTitle}>{session.title}</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.tab} ${isActive ? styles.tabActive : ""} ${isClosing ? styles.tabClosing : ""} ${isNew ? styles.tabNew : ""} ${isSettingsTab ? styles.tabSettings : ""} ${isFloating ? styles.tabFloating : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onPointerDown={!isSettingsTab ? onPointerDown : undefined}
      style={style}
    >
      {isActive && !isFloating && <div className={styles.tabCurveLeft} />}
      {isSettingsTab && <Settings size={14} className={styles.tabIcon} />}
      <span className={styles.tabTitle}>{session.title}</span>
      <button
        className={`${styles.tabButton} ${styles.tabCloseButton}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close tab"
      >
        <X size={12} />
      </button>
      {isActive && !isFloating && <div className={styles.tabCurveRight} />}
    </div>
  );
};

interface TabContextMenuState {
  x: number;
  y: number;
  tabId: string;
  tabIndex: number;
}

interface TabBarProps {
  sessions: ChatSession[];
  openTabs: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onCloseSession: (id: string) => boolean;
  onCloseOtherSessions: (keepId: string) => void;
  onCloseSessionsToRight: (fromId: string) => void;
  onShowWelcome: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  sessions,
  openTabs,
  activeSessionId,
  onSessionSelect,
  onCloseSession,
  onCloseOtherSessions,
  onCloseSessionsToRight,
  onShowWelcome,
  onReorderTabs,
}) => {
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [newTabId, setNewTabId] = useState<string | null>(null);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0); // Visual X position of floating tab
  const [dragWidth, setDragWidth] = useState(0);

  // Refs for drag logic
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number; // Pointer X at start
    initialTabX: number; // Tab X relative to container at start
    currentIndex: number;
  }>({ startX: 0, initialTabX: 0, currentIndex: 0 });

  const prevOpenTabIds = useRef<Set<string>>(
    new Set(openTabs.map((t) => t.id)),
  );
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(
    null,
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const currentIds = new Set(openTabs.map((t) => t.id));

    const addedTab = openTabs.find((t) => !prevOpenTabIds.current.has(t.id));

    if (addedTab) {
      setNewTabId(addedTab.id);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        setNewTabId(null);
        timerRef.current = null;
      }, 500);
    }

    prevOpenTabIds.current = currentIds;
  }, [openTabs]);

  const visibleSessions = openTabs.slice(0, MAX_VISIBLE_TABS);
  const isAtLimit = openTabs.length >= MAX_VISIBLE_TABS;

  const handleCloseTab = (id: string) => {
    setClosingTabId(id);

    setTimeout(() => {
      onCloseSession(id);
      setClosingTabId(null);
    }, 200);
  };

  const handleAddTab = () => {
    if (isAtLimit) return;
    onShowWelcome();
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    tabId: string,
    tabIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId, tabIndex });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Pointer Drag Logic
  const handlePointerDown = (
    e: React.PointerEvent,
    tabId: string,
    index: number,
  ) => {
    // Only left click
    if (e.button !== 0) return;

    const target = e.currentTarget as HTMLElement;
    const container = containerRef.current;
    if (!container) return;

    const startX = e.clientX;
    const startY = e.clientY;

    let isClick = true;

    const timer = setTimeout(() => {
      isClick = false;
      // Start Dragging
      target.setPointerCapture(e.pointerId);

      // Global selection block
      document.body.style.userSelect = "none";

      const containerRect = container.getBoundingClientRect();
      const tabRect = target.getBoundingClientRect();
      const initialTabX = tabRect.left - containerRect.left;

      // --- CACHE LAYOUT ---
      const tabElements = Array.from(container.children) as HTMLElement[];
      const layoutCache = visibleSessions.map((_, i) => {
        const el = tabElements[i];
        // Note: The dragged item (index) might be a placeholder now, but its slot is still correct
        // because we haven't re-rendered with new order yet.
        // However, we must be careful: if we are using index from map, we can get rects.
        if (!el) return { left: 0, width: 0, center: 0 };
        const rect = el.getBoundingClientRect();
        const left = rect.left - containerRect.left;
        return {
          left,
          width: rect.width,
          center: left + rect.width / 2,
        };
      });

      // We remove non-tab elements if any (like the add button which is last)
      // The map above only goes through visibleSessions, so it should match indices 0..N-1

      dragState.current = {
        startX: e.clientX,
        initialTabX: initialTabX,
        currentIndex: index,
      };

      setDraggingId(tabId);
      setDragX(initialTabX);
      setDragWidth(tabRect.width);

      const onPointerMove = (ev: PointerEvent) => {
        if (!containerRef.current) return;

        const delta = ev.clientX - dragState.current.startX;
        let newX = dragState.current.initialTabX + delta;

        // Constrain to container
        const maxScroll = containerRef.current.clientWidth - tabRect.width;
        newX = Math.max(0, Math.min(newX, maxScroll));

        setDragX(newX);

        // --- OPTIMIZED REORDER CHECK ---
        if (onReorderTabs) {
          const currentCenter = newX + tabRect.width / 2;
          let targetIndex = dragState.current.currentIndex;

          // Check if we passed the center of any neighbor
          // dragging Right
          for (let i = targetIndex + 1; i < visibleSessions.length; i++) {
            if (currentCenter > layoutCache[i].center) {
              targetIndex = i;
            } else {
              break; // Sorted, so if we didn't pass this one, we won't pass next
            }
          }

          // dragging Left
          if (targetIndex === dragState.current.currentIndex) {
            for (let i = targetIndex - 1; i >= 0; i--) {
              if (currentCenter < layoutCache[i].center) {
                targetIndex = i;
              } else {
                break;
              }
            }
          }

          if (targetIndex !== dragState.current.currentIndex) {
            onReorderTabs(dragState.current.currentIndex, targetIndex);

            // Re-measure / Update Cache?
            // "Normal" browser tabs behavior: when you swap, the slot moves.
            // The simple logic "VSCode style" often assumes slots are fixed relative to mouse.
            // If we swap indices, the content of slots changes but sizes might be similar.
            // Since we assume simple tabs of equal or similar size, swapping index logic is enough.
            // The key is: we use the INITIAL layout for the duration of the drag to avoid thrashing.
            // If tabs have variable widths, we might need to swap the cache entries too,
            // but for now, assuming standard tabs, keeping the cache static works for valid hit testing.

            // Correction: If we swap, we swap the data in the array.
            // The item at 'targetIndex' moves to 'currentIndex'.
            // To make it feel responsive, we update our 'currentIndex' to the new one.
            dragState.current.currentIndex = targetIndex;
          }
        }
      };

      const onPointerUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        setDraggingId(null);
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }, 200); // 200ms long press

    const onInitialUp = () => {
      clearTimeout(timer);
      if (isClick) {
        // handle click if needed, or let bubble up if onClick handles it
      }
      window.removeEventListener("pointerup", onInitialUp);
      window.removeEventListener("pointermove", onInitialMove);
    };

    const onInitialMove = (ev: PointerEvent) => {
      if (
        Math.abs(ev.clientX - startX) > 5 ||
        Math.abs(ev.clientY - startY) > 5
      ) {
        clearTimeout(timer);
        window.removeEventListener("pointerup", onInitialUp);
        window.removeEventListener("pointermove", onInitialMove);
      }
    };

    window.addEventListener("pointerup", onInitialUp);
    window.addEventListener("pointermove", onInitialMove);
  };

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabsContainer} ref={containerRef}>
        {visibleSessions.map((session, index) => {
          const isDragging = draggingId === session.id;

          return (
            <Tab
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => onSessionSelect(session.id)}
              onClose={() => handleCloseTab(session.id)}
              onContextMenu={(e) => handleContextMenu(e, session.id, index)}
              isClosing={closingTabId === session.id}
              isNew={newTabId === session.id}
              isPlaceholder={isDragging}
              onPointerDown={(e) => handlePointerDown(e, session.id, index)}
            />
          );
        })}

        {draggingId && (
          <Tab
            session={sessions.find((s) => s.id === draggingId)!}
            isActive={draggingId === activeSessionId}
            onSelect={() => {}}
            onClose={() => handleCloseTab(draggingId)}
            onContextMenu={(e) => {}}
            isFloating={true}
            style={{ left: dragX, width: dragWidth }}
          />
        )}
        <button
          className={`${styles.tabAddButton} ${isAtLimit ? styles.tabAddDisabled : ""}`}
          onClick={handleAddTab}
          title={isAtLimit ? "Close tab to add" : "New tab"}
          disabled={isAtLimit}
        >
          <Plus size={14} />
        </button>
      </div>

      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tabId={contextMenu.tabId}
          onClose={handleCloseContextMenu}
          onCloseTab={() => handleCloseTab(contextMenu.tabId)}
          onCloseOthers={() => onCloseOtherSessions(contextMenu.tabId)}
          onCloseToRight={() => onCloseSessionsToRight(contextMenu.tabId)}
          hasTabsToRight={contextMenu.tabIndex < visibleSessions.length - 1}
          hasOtherTabs={openTabs.length > 1}
        />
      )}
    </div>
  );
};
