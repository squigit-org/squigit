/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Plus, X } from "lucide-react";
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
}

const Tab: React.FC<TabProps> = ({
  session,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  isClosing,
  isNew,
}) => {
  return (
    <div
      className={`${styles.tab} ${isActive ? styles.tabActive : ""} ${isClosing ? styles.tabClosing : ""} ${isNew ? styles.tabNew : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {isActive && <div className={styles.tabCurveLeft} />}
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
  onNewChat: () => void;
  onCloseSession: (id: string) => boolean;
  onCloseOtherSessions: (keepId: string) => void;
  onCloseSessionsToRight: (fromId: string) => void;
  onNewSession: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  sessions,
  openTabs,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onCloseSession,
  onCloseOtherSessions,
  onCloseSessionsToRight,
  onNewSession,
}) => {
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [newTabId, setNewTabId] = useState<string | null>(null);
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
      const shouldShowWelcome = onCloseSession(id);
      if (shouldShowWelcome) {
        onNewSession();
      }
      setClosingTabId(null);
    }, 200);
  };

  const handleAddTab = () => {
    if (isAtLimit) return;
    onNewChat();
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

  if (openTabs.length === 0) {
    return null;
  }

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
