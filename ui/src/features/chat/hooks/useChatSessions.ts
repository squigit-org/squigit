/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { ChatSession, Message } from "../types/chat.types";

export const useChatSessions = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const createSession = useCallback(
    (type: "default" | "edit", title: string = "New Chat"): string => {
      const id = Date.now().toString();
      const newSession: ChatSession = {
        id,
        title,
        messages: [],
        streamingText: "",
        firstResponseId: null,
        createdAt: Date.now(),
        type,
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(id);
      return id;
    },
    []
  );

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const updateSession = useCallback(
    (
      id: string,
      updates: Partial<Omit<ChatSession, "id" | "createdAt" | "type">>
    ) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id ? { ...session, ...updates } : session
        )
      );
    },
    []
  );

  const updateSessionTitle = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, title } : session
      )
    );
  }, []);

  const getActiveSession = useCallback((): ChatSession | null => {
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const addMessageToSession = useCallback(
    (sessionId: string, message: Message) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, messages: [...session.messages, message] }
            : session
        )
      );
    },
    []
  );

  const setSessionMessages = useCallback(
    (sessionId: string, messages: Message[]) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, messages } : session
        )
      );
    },
    []
  );

  const setSessionStreamingText = useCallback(
    (sessionId: string, streamingText: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, streamingText } : session
        )
      );
    },
    []
  );

  const setSessionFirstResponseId = useCallback(
    (sessionId: string, firstResponseId: string | null) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, firstResponseId } : session
        )
      );
    },
    []
  );

  const getSessionById = useCallback(
    (id: string): ChatSession | null => {
      return sessions.find((s) => s.id === id) || null;
    },
    [sessions]
  );

  return {
    sessions,
    activeSessionId,
    createSession,
    switchSession,
    updateSession,
    updateSessionTitle,
    getActiveSession,
    getSessionById,
    addMessageToSession,
    setSessionMessages,
    setSessionStreamingText,
    setSessionFirstResponseId,
  };
};
