/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from "react";
import { ChatSession, Message } from "../types/chat.types";

export const useChatSessions = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const openTabs = useMemo(() => {
    return openTabIds
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is ChatSession => s !== undefined);
  }, [sessions, openTabIds]);

  const createSession = useCallback(
    (type: "default" | "edit", title: string = "New Chat"): string => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newSession: ChatSession = {
        id,
        title,
        messages: [],
        streamingText: "",
        firstResponseId: null,
        createdAt: Date.now(),
        type,
      };

      setSessions((prev) => [...prev, newSession]);

      setOpenTabIds((prev) => [...prev, id]);
      setActiveSessionId(id);
      return id;
    },
    [],
  );

  const openSession = useCallback((id: string): void => {
    setOpenTabIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
    setActiveSessionId(id);
  }, []);

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const updateSession = useCallback(
    (
      id: string,
      updates: Partial<Omit<ChatSession, "id" | "createdAt" | "type">>,
    ) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id ? { ...session, ...updates } : session,
        ),
      );
    },
    [],
  );

  const updateSessionTitle = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, title } : session,
      ),
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
            : session,
        ),
      );
    },
    [],
  );

  const setSessionMessages = useCallback(
    (sessionId: string, messages: Message[]) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, messages } : session,
        ),
      );
    },
    [],
  );

  const setSessionStreamingText = useCallback(
    (sessionId: string, streamingText: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, streamingText } : session,
        ),
      );
    },
    [],
  );

  const setSessionFirstResponseId = useCallback(
    (sessionId: string, firstResponseId: string | null) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, firstResponseId } : session,
        ),
      );
    },
    [],
  );

  const getSessionById = useCallback(
    (id: string): ChatSession | null => {
      return sessions.find((s) => s.id === id) || null;
    },
    [sessions],
  );

  const closeSession = useCallback(
    (id: string): boolean => {
      let shouldShowWelcome = false;

      setOpenTabIds((prev) => {
        const index = prev.indexOf(id);
        if (index === -1) return prev;

        const newOpenIds = prev.filter((tabId) => tabId !== id);

        if (newOpenIds.length === 0) {
          shouldShowWelcome = true;
          setActiveSessionId(null);
        } else if (id === activeSessionId) {
          const nextIndex = Math.min(index, newOpenIds.length - 1);
          setActiveSessionId(newOpenIds[nextIndex]);
        }

        return newOpenIds;
      });

      return shouldShowWelcome;
    },
    [activeSessionId],
  );

  const closeOtherSessions = useCallback((keepId: string): void => {
    setOpenTabIds([keepId]);
    setActiveSessionId(keepId);
  }, []);

  const closeSessionsToRight = useCallback((fromId: string): void => {
    setOpenTabIds((prev) => {
      const index = prev.indexOf(fromId);
      if (index === -1) return prev;
      return prev.slice(0, index + 1);
    });
  }, []);

  return {
    sessions,
    openTabs,
    openTabIds,
    activeSessionId,
    createSession,
    openSession,
    switchSession,
    closeSession,
    closeOtherSessions,
    closeSessionsToRight,
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
