/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pin, Trash2, Check, X } from "lucide-react";

import { ChatMetadata } from "@/lib";
import { updateIcon, welcomeIcon } from "@/assets";
import { Dialog } from "@/components";
import { getDeleteMultipleChatsDialog } from "@/lib";
import { PanelContextMenu } from "@/layout";
import { useAppContext } from "@/providers/AppProvider";
import { useKeyDown, getPendingUpdate } from "@/hooks";
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

interface ChatItemProps {
  chat: ChatMetadata;
  isActive: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelection: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onTogglePin: () => void;
  activeContextMenu: { id: string; x: number; y: number } | null;
  onOpenContextMenu: (id: string, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  onEnableSelectionMode: () => void;
}

const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  isActive,
  isSelectionMode,
  isSelected,
  onSelect,
  onToggleSelection,
  onDelete,
  onRename,
  onTogglePin,
  activeContextMenu,
  onOpenContextMenu,
  onCloseContextMenu,
  onEnableSelectionMode,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const showMenu = activeContextMenu?.id === chat.id;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (showMenu) {
      return;
    }
    onOpenContextMenu(chat.id, e.clientX, e.clientY);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== chat.title) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = useKeyDown({
    Enter: handleRenameSubmit,
    Escape: () => {
      setRenameValue(chat.title);
      setIsRenaming(false);
    },
  });

  return (
    <>
      <div
        className={`${styles.chatRow} ${isActive ? styles.active : ""} ${showMenu ? styles.menuOpen : ""}`}
        onClick={isSelectionMode ? onToggleSelection : onSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu(chat.id, e.clientX, e.clientY);
        }}
      >
        {isSelectionMode && (
          <Checkbox checked={isSelected} onChange={onToggleSelection} />
        )}

        {isRenaming ? (
          <input
            ref={inputRef}
            className={styles.chatTitleInput}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={styles.chatTitle}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsRenaming(true);
            }}
          >
            {chat.title}
          </span>
        )}

        {!isSelectionMode && (
          <div className={styles.chatActions}>
            <div className={styles.statusRow}>
              <button
                className={`${styles.starBtn} ${chat.is_pinned ? styles.pinned : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
                title={chat.is_pinned ? "Unpin" : "Pin"}
              >
                {chat.is_pinned ? (
                  <Pin
                    size={14}
                    style={{ transform: "rotate(45deg)" }}
                    fill="currentColor"
                  />
                ) : (
                  <Pin size={14} style={{ transform: "rotate(45deg)" }} />
                )}
              </button>

              <button
                className={styles.menuBtn}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={handleMenuClick}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showMenu && activeContextMenu && (
        <PanelContextMenu
          x={activeContextMenu.x}
          y={activeContextMenu.y}
          onClose={onCloseContextMenu}
          onRename={() => {
            setIsRenaming(true);
          }}
          onToggleSelection={() => {
            onEnableSelectionMode();
            if (!isSelected) {
              onToggleSelection();
            }
          }}
          onDelete={() => {
            onDelete();
          }}
          isSelected={isSelected}
        />
      )}
    </>
  );
};

export const SidePanel: React.FC = () => {
  const app = useAppContext();
  const chats = app.chatHistory.chats;
  const activeSessionId = app.chatHistory.activeSessionId;

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeContextMenu, setActiveContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Directly filter out system chats, no grouping needed
  const displayChats = useMemo(
    () =>
      chats
        .filter((c: any) => !c.id.startsWith("__system_"))
        // Sort pinned chats first, then by updated_at descending
        .sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
        }),
    [chats],
  );

  const update = getPendingUpdate();
  const showWelcome =
    !app.system.activeProfile && app.system.hasAgreed === false;

  const handleOpenContextMenu = useCallback((id: string, x: number, y: number) => {
    const xPos = x + 180 > window.innerWidth ? x - 180 : x;
    setActiveContextMenu((prev) => {
      if (prev && prev.id === id && prev.x === xPos && prev.y === y) {
        return prev;
      }
      return { id, x: xPos, y };
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setActiveContextMenu((prev) => (prev === null ? prev : null));
  }, []);

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds([]);
  };

  const toggleChatSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedIds(
      selectedIds.length === chats.length ? [] : chats.map((c: any) => c.id),
    );
  };

  const handleDeleteChat = () => {
    if (deleteId) {
      app.handleDeleteChatWrapper(deleteId);
      setDeleteId(null);
    }
  };

  const handleBulkDelete = () => {
    app.handleDeleteChatsWrapper(selectedIds);
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
              checked={selectedIds.length === chats.length && chats.length > 0}
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
              className={`${styles.iconBtn} ${styles.danger}`}
              onClick={() => selectedIds.length > 0 && setShowBulkDelete(true)}
              style={{ color: "var(--c-raw-015)" }}
              disabled={selectedIds.length === 0}
            >
              <Trash2 size={16} />
            </button>
            <button className={styles.iconBtn} onClick={toggleSelectionMode}>
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        (showWelcome || update) && (
          <div className={styles.headerArea}>
            <div className={styles.groupContent}>
              <div className={styles.groupInner}>
                {showWelcome && (
                  <div
                    className={`${styles.chatRow} ${activeSessionId === "__system_welcome" ? styles.active : ""}`}
                    onClick={() => app.handleSelectChat("__system_welcome")}
                  >
                    <div className={styles.chatIconMain}>
                      <img
                        src={welcomeIcon}
                        alt="Welcome"
                        className="w-5 h-5 object-contain"
                      />
                    </div>
                    <span className={styles.chatTitle}>
                      Welcome to {app.system.appName}!
                    </span>
                  </div>
                )}

                {update && (
                  <div
                    className={`${styles.chatRow} ${activeSessionId && activeSessionId.startsWith("__system_update") ? styles.active : ""}`}
                    onClick={() =>
                      app.handleSelectChat(`__system_update_${update.version}`)
                    }
                  >
                    <div className={styles.chatIconMain}>
                      <img
                        src={updateIcon}
                        alt="Update"
                        className="w-5 h-5 object-contain"
                      />
                    </div>
                    <span className={styles.chatTitle}>
                      Update Available: {update.version}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      <div className={styles.scrollArea}>
        <div className={styles.groupInner}>
          {displayChats.length > 0 ? (
            displayChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeSessionId}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.includes(chat.id)}
                onSelect={() => {
                  if (chat.id !== activeSessionId) {
                    app.handleSelectChat(chat.id);
                  }
                }}
                onToggleSelection={() => toggleChatSelection(chat.id)}
                onDelete={() => setDeleteId(chat.id)}
                onRename={(newTitle) =>
                  app.chatHistory.handleRenameChat(chat.id, newTitle)
                }
                onTogglePin={() => app.chatHistory.handleTogglePinChat(chat.id)}
                activeContextMenu={activeContextMenu}
                onOpenContextMenu={handleOpenContextMenu}
                onCloseContextMenu={handleCloseContextMenu}
                onEnableSelectionMode={() => setIsSelectionMode(true)}
              />
            ))
          ) : (
            <div
              style={{
                padding: "20px 20px",
                textAlign: "center",
                color: "var(--c-raw-073)",
                fontSize: "0.9rem",
              }}
            >
              No chats found
            </div>
          )}
        </div>
      </div>

      <Dialog
        isOpen={!!deleteId}
        type="DELETE_CHAT"
        appName={app.system.appName}
        onAction={(key) => {
          if (key === "confirm") handleDeleteChat();
          else setDeleteId(null);
        }}
      />

      <Dialog
        isOpen={showBulkDelete}
        type={getDeleteMultipleChatsDialog(selectedIds.length)}
        appName={app.system.appName}
        onAction={(key) => {
          if (key === "confirm") handleBulkDelete();
          else setShowBulkDelete(false);
        }}
      />
    </div>
  );
};
