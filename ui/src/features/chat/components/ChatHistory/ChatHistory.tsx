/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { MessagesSquare, Check, Plus } from "lucide-react";
import { ChatSession } from "../../types/chat.types";
import styles from "./ChatHistory.module.css";

interface ChatHistoryProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSessionSelect = (id: string) => {
    onSessionSelect(id);
    setIsOpen(false);
  };

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!next && buttonRef.current) {
        buttonRef.current.blur();
      }
      return next;
    });
  };

  return (
    <div className={styles.selectorContainer} ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className={`${styles.iconButton} ${isOpen ? styles.active : ""}`}
        title="Chat history"
      >
        <MessagesSquare size={18} />
      </button>

      {isOpen && (
        <div className={styles.chatSelectorMenu}>
          <div className={styles.chatSelectorHeader}>
            <span>Chats</span>
            <button
              className={styles.chatSelectorNewBtn}
              onClick={() => {
                onNewChat();
                setIsOpen(false);
              }}
              title="New chat"
            >
              <Plus size={14} />
            </button>
          </div>
          <ul className={styles.chatSelectorList}>
            {sessions.filter((s) => s.type !== "settings").length === 0 ? (
              <li className={styles.chatSelectorEmpty}>No chats yet</li>
            ) : (
              sessions
                .filter((s) => s.type !== "settings")
                .map((session) => (
                  <li
                    key={session.id}
                    onClick={() => handleSessionSelect(session.id)}
                    className={`${styles.dropdownItem} ${
                      session.id === activeSessionId ? styles.selected : ""
                    }`}
                  >
                    <span className={styles.chatSelectorTitle}>
                      {session.title}
                    </span>
                    {session.id === activeSessionId && (
                      <Check size={16} className={styles.checkIcon} />
                    )}
                  </li>
                ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
