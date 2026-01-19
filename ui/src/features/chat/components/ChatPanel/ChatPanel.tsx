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
  MessageCircle,
  Star,
  Check,
  FolderPlus,
  X,
  CheckSquare,
  Folder,
} from "lucide-react";
import {
  ChatMetadata,
  Project,
  groupChatsByDate,
} from "../../../../lib/storage/chatStorage";
import styles from "./ChatPanel.module.css";
import { createPortal } from "react-dom";

// --- Dialog Component ---
interface DialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const Dialog: React.FC<DialogProps> = ({
  isOpen,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className={styles.dialogOverlay}>
      <div className={styles.dialog}>
        <h3 className={styles.dialogTitle}>{title}</h3>
        {message && <p className={styles.dialogMessage}>{message}</p>}
        {children}
        <div className={styles.dialogActions}>
          <button
            className={`${styles.btn} ${styles.btnCancel}`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`${styles.btn} ${isDanger ? styles.btnDanger : styles.btnPrimary}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// --- Checkbox Component ---
const Checkbox: React.FC<{ checked: boolean; onChange: () => void }> = ({
  checked,
  onChange,
}) => (
  <div
    className={styles.checkboxContainer}
    onClick={(e) => {
      e.stopPropagation();
      onChange();
    }}
  >
    <div className={`${styles.checkbox} ${checked ? styles.checked : ""}`}>
      {checked && <Check size={12} className={styles.checkboxIcon} />}
    </div>
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
  onMoveToProject: () => void;
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
  onMoveToProject,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showMenu]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({ x: rect.right + 4, y: rect.top });
    }
    setShowMenu(!showMenu);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== chat.title) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setRenameValue(chat.title);
      setIsRenaming(false);
    }
  };

  return (
    <>
      <div
        className={`${styles.chatItem} ${isActive ? styles.active : ""}`}
        onClick={isSelectionMode ? onToggleSelection : onSelect}
      >
        {isSelectionMode && (
          <Checkbox checked={isSelected} onChange={onToggleSelection} />
        )}

        <MessageSquare size={14} className={styles.chatItemIcon} />

        {isRenaming ? (
          <input
            ref={inputRef}
            className={styles.renameInput}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.chatItemTitle}>{chat.title}</span>
        )}

        {chat.isStarred && (
          <Star
            size={12}
            fill="var(--primary)"
            className={styles.pinnedIcon}
            style={{ marginRight: 4 }}
          />
        )}
        {chat.isPinned && <Pin size={12} className={styles.pinnedIcon} />}

        {!isSelectionMode && (
          <button
            ref={menuBtnRef}
            className={styles.chatItemMenu}
            onClick={handleMenuClick}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>

      {showMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onToggleStar(); // Toggle Star
              setShowMenu(false);
            }}
          >
            <Star
              size={14}
              className={styles.contextMenuIcon}
              fill={chat.isStarred ? "currentColor" : "none"}
            />
            {chat.isStarred ? "Unstar" : "Star"}
          </button>

          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onTogglePin();
              setShowMenu(false);
            }}
          >
            <Pin size={14} className={styles.contextMenuIcon} />
            {chat.isPinned ? "Unpin" : "Pin"}
          </button>

          <button
            className={styles.contextMenuItem}
            onClick={() => {
              onMoveToProject();
              setShowMenu(false);
            }}
          >
            <Folder size={14} className={styles.contextMenuIcon} />
            Add to Project
          </button>

          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setIsRenaming(true);
              setShowMenu(false);
            }}
          >
            <Pencil size={14} className={styles.contextMenuIcon} />
            Rename
          </button>

          <button
            className={`${styles.contextMenuItem} ${styles.danger}`}
            onClick={() => {
              onDelete();
              setShowMenu(false);
            }}
          >
            <Trash2 size={14} className={styles.contextMenuIcon} />
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
  onToggleChatSelection: (id: string, shiftKey?: boolean) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onToggleStarChat: (id: string) => void;
  onMoveChatToProject: (id: string) => void;
  defaultExpanded?: boolean;
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
  onMoveChatToProject,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (chats.length === 0) return null;

  return (
    <div className={styles.group}>
      <div
        className={styles.groupHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span
          className={`${styles.groupIcon} ${!isExpanded ? styles.collapsed : ""}`}
        >
          ⌄
        </span>
        <h4 className={styles.groupTitle}>{title}</h4>
      </div>
      <div
        className={`${styles.groupItems} ${!isExpanded ? styles.collapsed : ""}`}
      >
        {chats.map((chat) => (
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
            onMoveToProject={() => onMoveChatToProject(chat.id)}
          />
        ))}
      </div>
    </div>
  );
};

// --- ChatPanel Component ---

interface ChatPanelProps {
  chats: ChatMetadata[];
  projects: Project[];
  activeSessionId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onDeleteChats: (ids: string[]) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onToggleStarChat: (id: string) => void;
  onCreateProject: (name: string) => Promise<Project | null>;
  onMoveChatToProject: (chatId: string, projectId: string | undefined) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chats,
  projects,
  activeSessionId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onDeleteChats,
  onRenameChat,
  onTogglePinChat,
  onToggleStarChat,
  onCreateProject,
  onMoveChatToProject,
}) => {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Dialog States
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [projectInput, setProjectInput] = useState("");
  const [chatToMove, setChatToMove] = useState<string | null>(null);

  const [showProjectSelector, setShowProjectSelector] = useState(false);

  const groupedChats = groupChatsByDate(chats, projects);
  const groupOrder = [
    "Favorites",
    "Pinned",
    ...projects.map((p) => `Project:${p.name}`),
    "Today",
    "Yesterday",
    "Last Week",
    "Last Month",
    "Older",
  ];

  // Selection Logic
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
    if (selectedIds.length === chats.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(chats.map((c) => c.id));
    }
  };

  // Delete Handlers
  const handleDeleteRequest = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      onDeleteChat(deleteId);
      setDeleteId(null);
    }
  };

  const confirmBulkDelete = () => {
    onDeleteChats(selectedIds);
    setSelectedIds([]);
    setIsSelectionMode(false);
    setShowBulkDeleteConfirm(false);
  };

  // Project Handlers
  const handleCreateProject = async () => {
    if (projectInput.trim()) {
      await onCreateProject(projectInput.trim());
      setProjectInput("");
      setShowProjectDialog(false);
    }
  };

  const handleMoveToProjectRequest = (chatId: string) => {
    setChatToMove(chatId);
    setShowProjectSelector(true);
  };

  const handleProjectSelect = (projectId: string | undefined) => {
    if (chatToMove) {
      onMoveChatToProject(chatToMove, projectId);
      setChatToMove(null);
      setShowProjectSelector(false);
    }
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      {isSelectionMode ? (
        <div className={styles.selectionHeader}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Checkbox
              checked={selectedIds.length === chats.length && chats.length > 0}
              onChange={selectAll}
            />
            <span className={styles.selectionCount}>
              {selectedIds.length} Selected
            </span>
          </div>
          <div className={styles.selectionActions}>
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              onClick={() => {
                if (selectedIds.length > 0) setShowBulkDeleteConfirm(true);
              }}
            >
              <Trash2 size={18} />
            </button>
            <button className={styles.iconBtn} onClick={toggleSelectionMode}>
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Chats</h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className={styles.iconBtn}
              onClick={toggleSelectionMode}
              title="Edit List"
            >
              <CheckSquare size={16} />
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => setShowProjectDialog(true)}
              title="New Project"
            >
              <FolderPlus size={16} />
            </button>
            <button className={styles.newChatBtn} onClick={onNewChat}>
              <Plus size={14} />
              New
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className={styles.chatList}>
        {chats.length === 0 ? (
          <div className={styles.emptyState}>
            <MessageCircle size={32} className={styles.emptyIcon} />
            <p className={styles.emptyText}>No chats yet</p>
          </div>
        ) : (
          groupOrder.map((groupName) => {
            const groupChats = groupedChats.get(groupName);
            if (!groupChats || groupChats.length === 0) return null;

            return (
              <ChatGroup
                key={groupName}
                title={groupName.replace("Project:", "")}
                chats={groupChats}
                activeSessionId={activeSessionId}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                onSelectChat={onSelectChat}
                onToggleChatSelection={toggleChatSelection}
                onDeleteChat={handleDeleteRequest}
                onRenameChat={onRenameChat}
                onTogglePinChat={onTogglePinChat}
                onToggleStarChat={onToggleStarChat}
                onMoveChatToProject={handleMoveToProjectRequest}
                defaultExpanded={
                  groupName === "Pinned" ||
                  groupName === "Today" ||
                  groupName === "Favorites" ||
                  groupName.startsWith("Project:")
                }
              />
            );
          })
        )}
      </div>

      {/* Modals */}

      {/* Delete Single Confirmation */}
      <Dialog
        isOpen={!!deleteId}
        title="Delete Chat?"
        message="Are you sure you want to delete this chat? All media and data will be removed locally."
        isDanger={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Delete Bulk Confirmation */}
      <Dialog
        isOpen={showBulkDeleteConfirm}
        title={`Delete ${selectedIds.length} Chats?`}
        message="Are you sure you want to delete these chats? This action cannot be undone."
        isDanger={true}
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      {/* New Project Dialog */}
      <Dialog
        isOpen={showProjectDialog}
        title="New Project"
        confirmLabel="Create"
        onConfirm={handleCreateProject}
        onCancel={() => setShowProjectDialog(false)}
      >
        <input
          autoFocus
          className={styles.input}
          placeholder="Project Name"
          value={projectInput}
          onChange={(e) => setProjectInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
        />
      </Dialog>

      {/* Project Selector Dialog (Simple List) */}
      <Dialog
        isOpen={showProjectSelector}
        title="Move to Project"
        confirmLabel=""
        cancelLabel="Close"
        onConfirm={() => {}}
        onCancel={() => setShowProjectSelector(false)}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          <button
            className={styles.btn}
            style={{
              textAlign: "left",
              background: "var(--neutral-800)",
              color: "var(--light)",
            }}
            onClick={() => handleProjectSelect(undefined)}
          >
            No Project (Remove)
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              className={styles.btn}
              style={{
                textAlign: "left",
                background: "var(--neutral-700)",
                color: "var(--light)",
              }}
              onClick={() => handleProjectSelect(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
};
