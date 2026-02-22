/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  MoreHorizontal,
  Pin,
  Trash2,
  ChevronDown,
  Star,
  Check,
  X,
  StarOff,
} from "lucide-react";

import { ChatMetadata, groupChatsByDate } from "@/lib/storage";
import styles from "./SidePanel.module.css";
import updateIcon from "@/assets/emoji_u1f4e6.png";
import welcomeIcon from "@/assets/emoji_u1f6e0.png";
import { Dialog } from "@/primitives";
import { PanelContextMenu } from "@/shell/menus";
import {
  getDeleteMultipleChatsDialog,
  getAppBusyDialog,
  DialogContent,
} from "@/lib/helpers";
import { useShellContext } from "@/shell/context";
import { useKeyDown, getPendingUpdate } from "@/hooks";

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
              {chat.is_pinned && (
                <div className={styles.pinIcon}>
                  <Pin
                    size={14}
                    style={{ transform: "rotate(45deg)" }}
                    fill="currentColor"
                  />
                </div>
              )}

              <button
                className={styles.starBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar();
                }}
                title={chat.is_starred ? "Unstar" : "Star"}
              >
                {chat.is_starred ? <StarOff size={14} /> : <Star size={14} />}
              </button>
            </div>

            <button
              ref={menuBtnRef}
              className={styles.menuBtn}
              onClick={handleMenuClick}
            >
              <MoreHorizontal size={14} />
            </button>
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
            onCloseContextMenu();
          }}
          onTogglePin={() => {
            onTogglePin();
            onCloseContextMenu();
          }}
          onToggleSelection={() => {
            onEnableSelectionMode();
            if (!isSelected) onToggleSelection();
            onCloseContextMenu();
          }}
          onDelete={() => {
            onDelete();
            onCloseContextMenu();
          }}
          isPinned={chat.is_pinned}
          isSelected={isSelected}
        />
      )}
    </>
  );
};

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
        <div className={styles.groupInner}>
          {chats.length > 0 ? (
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
          ) : (
            <div
              style={{
                padding: "20px 20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              No chats found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const SidePanel: React.FC = () => {
  const shell = useShellContext();
  const chats = shell.chatHistory.chats;
  const activeSessionId = shell.chatHistory.activeSessionId;

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeContextMenu, setActiveContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [isHoverDisabled, setIsHoverDisabled] = useState(false);

  const userChats = chats.filter((c) => !c.id.startsWith("__system_"));
  const groupedChats = groupChatsByDate(userChats);

  const update = getPendingUpdate();
  const showWelcome =
    !shell.system.activeProfile && shell.system.hasAgreed === false;

  const [busyDialog, setBusyDialog] = useState<DialogContent | null>(null);

  const handleAction = (action: () => void) => {
    const activeStates: string[] = [];

    if (shell.chat.isAnalyzing) activeStates.push("analyzing an image");
    if (shell.chat.isGenerating) activeStates.push("generating a response");
    if (shell.chat.isAiTyping) activeStates.push("typing a response");
    if (shell.isOcrScanning) activeStates.push("scanning an image");

    if (activeStates.length > 0) {
      let reason = "";
      if (activeStates.length === 1) {
        reason = activeStates[0];
      } else {
        const last = activeStates.pop();
        reason = `${activeStates.join(", ")} and ${last}`;
      }
      setBusyDialog(getAppBusyDialog(reason));
      return;
    }

    action();
  };

  useEffect(() => {
    const handleClick = () => setActiveContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleOpenContextMenu = (id: string, x: number, y: number) => {
    const xPos = x + 180 > window.innerWidth ? x - 180 : x;
    setActiveContextMenu({ id, x: xPos, y });
  };

  const toggleSelectionMode = () => {
    setIsHoverDisabled(true);
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

  const handleDeleteChat = () => {
    if (deleteId) {
      shell.handleDeleteChatWrapper(deleteId);
      setDeleteId(null);
    }
  };

  const handleBulkDelete = () => {
    shell.handleDeleteChatsWrapper(selectedIds);
    setSelectedIds([]);
    setIsSelectionMode(false);
    setShowBulkDelete(false);
  };

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
      onSelectChat={(id) => handleAction(() => shell.handleSelectChat(id))}
      onToggleChatSelection={toggleChatSelection}
      onDeleteChat={setDeleteId}
      onRenameChat={shell.chatHistory.handleRenameChat}
      onTogglePinChat={shell.chatHistory.handleTogglePinChat}
      onToggleStarChat={shell.handleToggleStarChat}
      defaultExpanded={expanded}
      activeContextMenu={activeContextMenu}
      onOpenContextMenu={handleOpenContextMenu}
      onCloseContextMenu={() => setActiveContextMenu(null)}
      onEnableSelectionMode={() => setIsSelectionMode(true)}
    />
  );

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
              className={`${styles.newChatBtn} ${isHoverDisabled ? styles.noHover : ""}`}
              onClick={() => handleAction(shell.handleNewSession)}
              onMouseLeave={() => setIsHoverDisabled(false)}
              style={{ flex: 1 }}
            >
              <span>New chat</span>
            </button>
          </div>

          {(showWelcome || update) && (
            <div className={styles.groupContent}>
              <div className={styles.groupInner}>
                {showWelcome && (
                  <div
                    className={`${styles.chatRow} ${activeSessionId === "__system_welcome" ? styles.active : ""}`}
                    onClick={() =>
                      handleAction(() =>
                        shell.handleSelectChat("__system_welcome"),
                      )
                    }
                  >
                    <div className={styles.chatIconMain}>
                      <img
                        src={welcomeIcon}
                        alt="Welcome"
                        className="w-5 h-5 object-contain"
                      />
                    </div>
                    <span className={styles.chatTitle}>
                      Welcome to {shell.system.appName}!
                    </span>
                  </div>
                )}

                {update && (
                  <div
                    className={`${styles.chatRow} ${activeSessionId && activeSessionId.startsWith("__system_update") ? styles.active : ""}`}
                    onClick={() =>
                      handleAction(() =>
                        shell.handleSelectChat(
                          `__system_update_${update.version}`,
                        ),
                      )
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
          )}
        </div>
      )}

      <div className={styles.scrollArea}>
        {groupedChats.get("Starred") &&
          groupedChats.get("Starred")!.length > 0 &&
          renderGroup("Starred", groupedChats.get("Starred")!)}

        {renderGroup("Recents", groupedChats.get("Recents") || [])}
      </div>

      <Dialog
        isOpen={!!deleteId}
        type="DELETE_CHAT"
        appName={shell.system.appName}
        onAction={(key) => {
          if (key === "confirm") handleDeleteChat();
          else setDeleteId(null);
        }}
      />

      <Dialog
        isOpen={showBulkDelete}
        type={getDeleteMultipleChatsDialog(selectedIds.length)}
        appName={shell.system.appName}
        onAction={(key) => {
          if (key === "confirm") handleBulkDelete();
          else setShowBulkDelete(false);
        }}
      />

      <Dialog
        isOpen={!!busyDialog}
        type={busyDialog || undefined}
        appName={shell.system.appName}
        onAction={() => setBusyDialog(null)}
      />
    </div>
  );
};
