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
} from "lucide-react";
import {
  ChatMetadata,
  groupChatsByDate,
} from "../../../../lib/storage/chatStorage";
import styles from "./ChatPanel.module.css";

interface ChatItemProps {
  chat: ChatMetadata;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onTogglePin: () => void;
}

const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
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
        onClick={onSelect}
      >
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

        {chat.isPinned && <Pin size={12} className={styles.pinnedIcon} />}

        <button
          ref={menuBtnRef}
          className={styles.chatItemMenu}
          onClick={handleMenuClick}
        >
          <MoreHorizontal size={14} />
        </button>
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
              setIsRenaming(true);
              setShowMenu(false);
            }}
          >
            <Pencil size={14} className={styles.contextMenuIcon} />
            Rename
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

interface ChatGroupProps {
  title: string;
  chats: ChatMetadata[];
  activeSessionId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  defaultExpanded?: boolean;
}

const ChatGroup: React.FC<ChatGroupProps> = ({
  title,
  chats,
  activeSessionId,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  onTogglePinChat,
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
            onSelect={() => onSelectChat(chat.id)}
            onDelete={() => onDeleteChat(chat.id)}
            onRename={(newTitle) => onRenameChat(chat.id, newTitle)}
            onTogglePin={() => onTogglePinChat(chat.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface ChatPanelProps {
  chats: ChatMetadata[];
  activeSessionId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chats,
  activeSessionId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onTogglePinChat,
}) => {
  const groupedChats = groupChatsByDate(chats);
  const groupOrder = [
    "Pinned",
    "Today",
    "Yesterday",
    "Last Week",
    "Last Month",
    "Older",
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>Chats</h3>
        <button className={styles.newChatBtn} onClick={onNewChat}>
          <Plus size={14} />
          New
        </button>
      </div>

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
                title={groupName}
                chats={groupChats}
                activeSessionId={activeSessionId}
                onSelectChat={onSelectChat}
                onDeleteChat={onDeleteChat}
                onRenameChat={onRenameChat}
                onTogglePinChat={onTogglePinChat}
                defaultExpanded={
                  groupName === "Pinned" || groupName === "Today"
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
};
