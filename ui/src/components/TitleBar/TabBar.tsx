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
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const Tab: React.FC<TabProps> = ({
  session,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  isClosing,
  isNew,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const isSettingsTab = session.type === "settings";

  return (
    <div
      className={`${styles.tab} ${isActive ? styles.tabActive : ""} ${isClosing ? styles.tabClosing : ""} ${isNew ? styles.tabNew : ""} ${isSettingsTab ? styles.tabSettings : ""} ${isDragging ? styles.tabDragging : ""} ${isDragOver ? styles.tabDragOver : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      draggable={!isSettingsTab}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isActive && <div className={styles.tabCurveLeft} />}
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
      {isActive && <div className={styles.tabCurveRight} />}
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
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
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

  // Drag handlers
  const handleDragStart = (
    e: React.DragEvent,
    tabId: string,
    index: number,
  ) => {
    setDraggingTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragEnd = () => {
    setDraggingTabId(null);
    setDragOverTabId(null);
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (tabId !== draggingTabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);

    if (!isNaN(fromIndex) && fromIndex !== toIndex && onReorderTabs) {
      onReorderTabs(fromIndex, toIndex);
    }

    setDraggingTabId(null);
    setDragOverTabId(null);
  };

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabsContainer}>
        {visibleSessions.map((session, index) => (
          <Tab
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={() => onSessionSelect(session.id)}
            onClose={() => handleCloseTab(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session.id, index)}
            isClosing={closingTabId === session.id}
            isNew={newTabId === session.id}
            isDragging={draggingTabId === session.id}
            isDragOver={dragOverTabId === session.id}
            onDragStart={(e) => handleDragStart(e, session.id, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, session.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          />
        ))}
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
