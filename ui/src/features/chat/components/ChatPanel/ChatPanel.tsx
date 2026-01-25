/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Trash2,
  Pencil,
  ChevronDown,
  Star,
  Check,
  X,
  CheckSquare,
} from "lucide-react";

import { Dialog } from "../../../../components/Dialog";
import {
  ChatMetadata,
  groupChatsByDate,
} from "../../../../lib/storage/chatStorage";
import styles from "./ChatPanel.module.css";
import { createPortal } from "react-dom";

// --- Internal "Prompt" Dialog ---
interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
}

const PromptDialog: React.FC<PromptDialogProps> = ({
  isOpen,
  title,
  children,
  onClose,
  primaryAction,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div
        className={styles.modalContainer}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h4 className={styles.modalTitle}>{title}</h4>

        {children}

        <div className={styles.modalActions}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
          >
            Cancel
          </button>
          {primaryAction && (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// --- Checkbox ---
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

// --- ChatItem Component ---

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
  onToggleStar: () => void;
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
  onToggleStar,
  activeContextMenu,
  onOpenContextMenu,
  onCloseContextMenu,
  onEnableSelectionMode,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
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
      onCloseContextMenu();
      return;
    }
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) {
      onOpenContextMenu(chat.id, e.clientX, e.clientY);
    }
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== chat.title) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameSubmit();
    else if (e.key === "Escape") {
      setRenameValue(chat.title);
      setIsRenaming(false);
    }
  };

  return (
    <>
      <div
        className={`${styles.chatRow} ${isActive ? styles.active : ""}`}
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

        {!isSelectionMode && (
          <React.Fragment>
            {chat.is_pinned ? (
              <Pin
                size={14}
                className={styles.chatIconMain}
                style={{ transform: "rotate(45deg)" }}
              />
            ) : chat.is_starred ? (
              <Star
                size={14}
                className={styles.chatIconMain}
                fill="currentColor"
              />
            ) : (
              <MessageSquare size={16} className={styles.chatIconMain} />
            )}
          </React.Fragment>
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
          <span className={styles.chatTitle} title={chat.title}>
            {chat.title}
          </span>
        )}

        {!isSelectionMode && (
          <button
            ref={menuBtnRef}
            className={styles.chatMenuBtn}
            onClick={handleMenuClick}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>

      {showMenu && activeContextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: activeContextMenu.x, top: activeContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onEnableSelectionMode();
              if (!isSelected) onToggleSelection();
              onCloseContextMenu();
            }}
          >
            <CheckSquare size={14} /> Select
          </button>

          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onToggleStar();
              onCloseContextMenu();
            }}
          >
            <Star size={14} fill={chat.is_starred ? "currentColor" : "none"} />
            {chat.is_starred ? "Unstar" : "Star"}
          </button>

          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onTogglePin();
              onCloseContextMenu();
            }}
          >
            <Pin size={14} />
            {chat.is_pinned ? "Unpin" : "Pin"}
          </button>

          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setIsRenaming(true);
              onCloseContextMenu();
            }}
          >
            <Pencil size={14} />
            Rename
          </button>

          <div
            style={{
              height: 1,
              background: "var(--border-color)",
              margin: "4px 0",
            }}
          />

          <button
            className={`${styles.contextMenuItem} ${styles.danger}`}
            onClick={() => {
              onDelete();
              onCloseContextMenu();
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </>
  );
};

// --- ChatGroup Component ---

interface ChatGroupProps {
  title: string;
  chats: ChatMetadata[];
  activeSessionId: string | null;
  isSelectionMode: boolean;
  selectedIds: string[];
  onSelectChat: (id: string) => void;
  onToggleChatSelection: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onToggleStarChat: (id: string) => void;
  defaultExpanded?: boolean;
  activeContextMenu: { id: string; x: number; y: number } | null;
  onOpenContextMenu: (id: string, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  onEnableSelectionMode: () => void;
}

const ChatGroup: React.FC<ChatGroupProps> = ({
  title,
  chats,
  activeSessionId,
  isSelectionMode,
  selectedIds,
  onSelectChat,
  onToggleChatSelection,
  onDeleteChat,
  onRenameChat,
  onTogglePinChat,
  onToggleStarChat,
  defaultExpanded = true,
  activeContextMenu,
  onOpenContextMenu,
  onCloseContextMenu,
  onEnableSelectionMode,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // If it's a project group, we show it even if empty (but show "No chats" inside)
  // For standard groups (Today, Yesterday), we only show if not empty.
  // Logic handled in parent: parent only passes "Time" groups if they have items.
  // Parent passes Projects always.

  return (
    <div className={styles.groupWrapper}>
      <div
        className={styles.groupHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronDown
          className={`${styles.groupChevron} ${!isExpanded ? styles.collapsed : ""}`}
        />
        <h4 className={styles.groupTitle}>{title}</h4>
      </div>
      <div
        className={`${styles.groupContent} ${!isExpanded ? styles.collapsed : ""}`}
      >
        {chats.length === 0 ? (
          <div className={styles.groupEmpty}>This project is empty</div>
        ) : (
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeSessionId}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.includes(chat.id)}
              onSelect={() => onSelectChat(chat.id)}
              onToggleSelection={() => onToggleChatSelection(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
              onRename={(newTitle) => onRenameChat(chat.id, newTitle)}
              onTogglePin={() => onTogglePinChat(chat.id)}
              onToggleStar={() => onToggleStarChat(chat.id)}
              activeContextMenu={activeContextMenu}
              onOpenContextMenu={onOpenContextMenu}
              onCloseContextMenu={onCloseContextMenu}
              onEnableSelectionMode={onEnableSelectionMode}
            />
          ))
        )}
      </div>
    </div>
  );
};

// --- Main ChatPanel Component ---

interface ChatPanelProps {
  chats: ChatMetadata[];
  activeSessionId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onDeleteChats: (ids: string[]) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onToggleStarChat: (id: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chats,
  activeSessionId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onDeleteChats,
  onRenameChat,
  onTogglePinChat,
  onToggleStarChat,
}) => {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeContextMenu, setActiveContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // -- Modal States --
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Group chats (now only Starred and Recents)
  const groupedChats = groupChatsByDate(chats);

  // Close context menu on global click
  useEffect(() => {
    const handleClick = () => setActiveContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleOpenContextMenu = (id: string, x: number, y: number) => {
    const xPos = x + 180 > window.innerWidth ? x - 180 : x;
    setActiveContextMenu({ id, x: xPos, y });
  };

  // -- Selection Logic --
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
      selectedIds.length === chats.length ? [] : chats.map((c) => c.id),
    );
  };

  // -- Action Handlers --

  const handleDeleteChat = () => {
    if (deleteId) {
      onDeleteChat(deleteId);
      setDeleteId(null);
    }
  };

  const handleBulkDelete = () => {
    onDeleteChats(selectedIds);
    setSelectedIds([]);
    setIsSelectionMode(false);
    setShowBulkDelete(false);
  };

  // Helper to render a generic group
  const renderGroup = (
    title: string,
    groupChats: ChatMetadata[],
    expanded = true,
  ) => (
    <ChatGroup
      key={title}
      title={title}
      chats={groupChats}
      activeSessionId={activeSessionId}
      isSelectionMode={isSelectionMode}
      selectedIds={selectedIds}
      onSelectChat={onSelectChat}
      onToggleChatSelection={toggleChatSelection}
      onDeleteChat={setDeleteId}
      onRenameChat={onRenameChat}
      onTogglePinChat={onTogglePinChat}
      onToggleStarChat={onToggleStarChat}
      defaultExpanded={expanded}
      activeContextMenu={activeContextMenu}
      onOpenContextMenu={handleOpenContextMenu}
      onCloseContextMenu={() => setActiveContextMenu(null)}
      onEnableSelectionMode={() => setIsSelectionMode(true)}
    />
  );

  return (
    <div className={styles.panel}>
      {/* Header */}
      {isSelectionMode ? (
        <div className={styles.selectionHeader}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button className={styles.selectAllBtn} onClick={selectAll}>
              {selectedIds.length === chats.length ? "None" : "All"}
            </button>
            <span className={styles.selectionCount}>
              {selectedIds.length} selected
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              onClick={() => selectedIds.length > 0 && setShowBulkDelete(true)}
              style={{ color: "var(--danger)" }}
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
        <div className={styles.headerArea}>
          <div className={styles.utilityBar}>
            <button
              className={styles.newChatBtn}
              onClick={onNewChat}
              style={{ flex: 1 }}
            >
              <span>New chat</span>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className={styles.scrollArea}>
        {/* 1. Starred Group */}
        {groupedChats.get("Starred") &&
          groupedChats.get("Starred")!.length > 0 &&
          renderGroup("Starred", groupedChats.get("Starred")!)}

        {/* 2. Recents Group */}
        {groupedChats.get("Recents") &&
          groupedChats.get("Recents")!.length > 0 &&
          renderGroup("Recents", groupedChats.get("Recents")!)}

        {/* Empty State if absolutely nothing exists */}
        {chats.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <p style={{ fontSize: "0.9rem", marginBottom: 8 }}>
              No chats found
            </p>
          </div>
        )}
      </div>

      {/* --- CONFIRMATION DIALOGS --- */}
      <Dialog
        isOpen={!!deleteId}
        variant="error"
        title="Delete Chat"
        message="Are you sure you want to delete this chat?\nThis action cannot be undone."
        actions={[
          {
            label: "Cancel",
            onClick: () => setDeleteId(null),
            variant: "secondary",
          },
          { label: "Delete", onClick: handleDeleteChat, variant: "danger" },
        ]}
      />

      <Dialog
        isOpen={showBulkDelete}
        variant="error"
        title="Delete Multiple Chats"
        message={`Are you sure you want to delete ${selectedIds.length} chats?\nThis action cannot be undone.`}
        actions={[
          {
            label: "Cancel",
            onClick: () => setShowBulkDelete(false),
            variant: "secondary",
          },
          { label: "Delete All", onClick: handleBulkDelete, variant: "danger" },
        ]}
      />
    </div>
  );
};
