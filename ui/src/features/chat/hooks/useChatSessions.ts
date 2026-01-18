/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { ChatSession, Message, ModelType } from "../types/chat.types";
import { Chat } from "@google/genai";
import {
  startNewChatStream,
  sendMessage,
  initializeGemini,
} from "../../../lib/api/gemini/client";
import { systemPrompt } from "../../../lib/config/prompts";

export const useChatSessions = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const chatInstances = useRef<Map<string, Chat>>(new Map());

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
        imageData: null,
        lensUrl: null,
        inputText: "",
        isLoading: false,
        error: null,
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

  const updateSessionImage = useCallback(
    (
      sessionId: string,
      imageData: {
        base64: string;
        mimeType: string;
        isFilePath?: boolean;
      } | null,
    ) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, imageData } : session,
        ),
      );
    },
    [],
  );

  const closeSession = useCallback(
    (id: string): boolean => {
      chatInstances.current.delete(id);

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
    for (const id of chatInstances.current.keys()) {
      if (id !== keepId) chatInstances.current.delete(id);
    }
    setOpenTabIds([keepId]);
    setActiveSessionId(keepId);
  }, []);

  const closeSessionsToRight = useCallback((fromId: string): void => {
    setOpenTabIds((prev) => {
      const index = prev.indexOf(fromId);
      if (index === -1) return prev;

      const removedIds = prev.slice(index + 1);
      removedIds.forEach((id) => chatInstances.current.delete(id));

      return prev.slice(0, index + 1);
    });
  }, []);

  const setSessionInputText = useCallback(
    (sessionId: string, inputText: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, inputText } : session,
        ),
      );
    },
    [],
  );

  const updateSessionLensUrl = useCallback(
    (sessionId: string, lensUrl: string | null) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, lensUrl } : session,
        ),
      );
    },
    [],
  );

  const startChatSession = useCallback(
    async (
      sessionId: string,
      apiKey: string,
      model: string,
      prompt: string,
      explicitImageData?: {
        base64: string;
        mimeType: string;
        isFilePath?: boolean;
      },
    ) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session && !explicitImageData) return;

      const imageData = explicitImageData || session?.imageData;
      if (!imageData || !apiKey) return;

      initializeGemini(apiKey);

      updateSession(sessionId, {
        isLoading: true,
        error: null,
        messages: [],
        firstResponseId: null,
        streamingText: "",
      });

      try {
        const fullPrompt = `<sys-prmp>
${systemPrompt}
</sys-prmp>
MSS: ${prompt}`;

        let finalBase64 = imageData.base64;

        if (imageData.isFilePath) {
          try {
            const res = await fetch(imageData.base64);
            const blob = await res.blob();
            finalBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error("Failed to fetch asset", e);
            throw new Error("Failed to load image file.");
          }
        }

        const responseId = Date.now().toString();
        updateSession(sessionId, { firstResponseId: responseId });

        const { text, chat } = await startNewChatStream(
          model,
          finalBase64,
          imageData.mimeType,
          fullPrompt,
          (token) => {
            setSessions((current) =>
              current.map((s) =>
                s.id === sessionId
                  ? { ...s, streamingText: (s.streamingText || "") + token }
                  : s,
              ),
            );
          },
        );

        chatInstances.current.set(sessionId, chat);

        updateSession(sessionId, {
          isLoading: false,
          streamingText: text,
        });
      } catch (err: any) {
        console.error("Chat start error", err);
        updateSession(sessionId, {
          isLoading: false,
          error: err.message || "Failed to start chat",
        });
      }
    },
    [sessions, updateSession],
  );

  const sendChatMessage = useCallback(
    async (sessionId: string, text: string) => {
      if (!text.trim()) return;

      const chat = chatInstances.current.get(sessionId);
      if (!chat) {
        console.error("No chat instance for session", sessionId);

        return;
      }

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        text,
        timestamp: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;

          let newMessages = [...s.messages];
          if (s.streamingText && s.firstResponseId) {
            newMessages.push({
              id: s.firstResponseId,
              role: "model",
              text: s.streamingText,
              timestamp: Date.now(),
            });
          }

          return {
            ...s,
            messages: [...newMessages, userMsg],
            streamingText: "",
            firstResponseId: null,
            isLoading: true,
            error: null,
            inputText: "",
          };
        }),
      );

      try {
        const responseText = await sendMessage(chat, text);

        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "model",
          text: responseText,
          timestamp: Date.now(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, botMsg], isLoading: false }
              : s,
          ),
        );
      } catch (err: any) {
        updateSession(sessionId, {
          isLoading: false,
          error: err.message || "Failed to send message",
        });
      }
    },
    [updateSession],
  );

  const retryChatMessage = useCallback(async (sessionId: string) => {}, []);

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
    updateSessionImage,
    setSessionInputText,
    updateSessionLensUrl,
    startChatSession,
    sendChatMessage,
    retryChatMessage,
  };
};
