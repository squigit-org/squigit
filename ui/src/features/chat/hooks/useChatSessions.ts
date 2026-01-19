/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ChatSession, Message, ModelType } from "../types/chat.types";
import { Chat } from "@google/genai";
import {
  startNewChatStream,
  sendMessage,
  initializeGemini,
} from "../../../lib/api/gemini/client";
import { systemPrompt } from "../../../lib/config/prompts";
import {
  loadChatIndex,
  loadChat,
  saveChat,
  deleteChat,
  deleteChats,
  renameChat,
  pinChat,
  starChat,
  createProject,
  loadProjects,
  setChatProject,
  ChatMetadata,
  Project,
} from "../../../lib/storage/chatStorage";

import { parseGeminiError } from "../../../lib/utils/errorParser";

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

  // Chat metadata for side panel
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata[]>([]);

  const createSession = useCallback(
    (
      type: "default" | "edit" | "settings",
      title: string = "New Chat",
    ): string => {
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

  // Tab reordering
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setOpenTabIds((prev) => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return newOrder;
    });
  }, []);

  // Pin/unpin session
  const pinSession = useCallback(async (id: string, isPinned: boolean) => {
    try {
      await pinChat(id, isPinned);
      setChatMetadata((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPinned } : c)),
      );
    } catch (error) {
      console.error("Failed to pin session:", error);
    }
  }, []);

  // Delete session from storage and state
  const deleteSession = useCallback(
    async (id: string, skipStateUpdate?: boolean) => {
      // skipStateUpdate is for bulk delete usage
      try {
        await deleteChat(id);
        if (!skipStateUpdate) {
          setChatMetadata((prev) => prev.filter((c) => c.id !== id));
          setSessions((prev) => prev.filter((s) => s.id !== id));

          // Close tab if open
          setOpenTabIds((prev) => {
            if (!prev.includes(id)) return prev;
            const index = prev.indexOf(id);
            const newOpenIds = prev.filter((tabId) => tabId !== id);

            if (id === activeSessionId) {
              if (newOpenIds.length === 0) {
                setActiveSessionId(null);
              } else {
                const nextIndex = Math.min(index, newOpenIds.length - 1);
                setActiveSessionId(newOpenIds[nextIndex]);
              }
            }
            return newOpenIds;
          });
        }
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    },
    [activeSessionId],
  );

  const deleteSessions = useCallback(
    async (ids: string[]) => {
      try {
        await deleteChats(ids);

        // Batch update state
        setChatMetadata((prev) => prev.filter((c) => !ids.includes(c.id)));
        setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));

        setOpenTabIds((prev) => {
          const newOpenIds = prev.filter((tabId) => !ids.includes(tabId));

          if (newOpenIds.length === 0) {
            // If all open tabs were deleted, show welcome if we were viewing one
            if (activeSessionId && ids.includes(activeSessionId)) {
              setActiveSessionId(null);
            }
          } else if (activeSessionId && ids.includes(activeSessionId)) {
            // If active session deleted, switch to last available
            setActiveSessionId(newOpenIds[newOpenIds.length - 1]);
          }

          return newOpenIds;
        });
      } catch (error) {
        console.error("Failed to batch delete sessions:", error);
      }
    },
    [activeSessionId],
  );

  // Rename session
  const renameSession = useCallback(async (id: string, newTitle: string) => {
    try {
      await renameChat(id, newTitle);
      setChatMetadata((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)),
      );
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s)),
      );
    } catch (error) {
      console.error("Failed to rename session:", error);
    }
  }, []);

  // Star session
  const starSession = useCallback(async (id: string, isStarred: boolean) => {
    try {
      await starChat(id, isStarred);
      setChatMetadata((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isStarred } : c)),
      );
      // Update active session if loaded
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isStarred } : s)),
      );
    } catch (error) {
      console.error("Failed to star session:", error);
    }
  }, []);

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);

  const refreshProjects = useCallback(async () => {
    try {
      const loaded = await loadProjects();
      setProjects(loaded);
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  }, []);

  const createNewProject = useCallback(async (name: string) => {
    try {
      const project = await createProject(name);
      setProjects((prev) => [...prev, project]);
      return project;
    } catch (e) {
      console.error("Failed to create project", e);
      return null;
    }
  }, []);

  const moveChatToProject = useCallback(
    async (chatId: string, projectId: string | undefined) => {
      try {
        await setChatProject(chatId, projectId);
        setChatMetadata((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, projectId } : c)),
        );
        setSessions((prev) =>
          prev.map((s) => (s.id === chatId ? { ...s, projectId } : s)),
        );
      } catch (e) {
        console.error("Failed to set chat project", e);
      }
    },
    [],
  );

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const metadata = await loadChatIndex();
        setChatMetadata(metadata);

        const loadedProjects = await loadProjects();
        setProjects(loadedProjects);
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    };
    loadHistory();
  }, []);

  const saveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Auto-save chats when they have messages
  const saveSessionDebounced = useCallback((session: ChatSession) => {
    // Save logic has changed in storage to check for image too,
    // but the debounce trigger here was checking messages.length > 0.
    // We update it to run if messages OR image exists.
    if (
      (session.messages.length > 0 || session.imageData) &&
      session.type !== "settings"
    ) {
      const existing = saveTimeouts.current.get(session.id);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(async () => {
        try {
          await saveChat(session);
          // Update metadata
          setChatMetadata((prev) => {
            const exists = prev.find((c) => c.id === session.id);
            if (exists) {
              return prev.map((c) =>
                c.id === session.id
                  ? {
                      ...c,
                      title: session.title,
                      messageCount: session.messages.length,
                      updatedAt: Date.now(),
                      // Ensure robust metadata preservation
                      isPinned:
                        (session as any).isPinned || c.isPinned || false,
                      isStarred: session.isStarred || c.isStarred,
                      projectId: session.projectId || c.projectId,
                    }
                  : c,
              );
            } else {
              return [
                {
                  id: session.id,
                  title: session.title,
                  createdAt: session.createdAt,
                  updatedAt: Date.now(),
                  isPinned: false,
                  messageCount: session.messages.length,
                  hasImage: !!session.imageData,
                  isStarred: session.isStarred,
                  projectId: session.projectId,
                },
                ...prev,
              ];
            }
          });
        } catch (error) {
          console.error("Failed to save chat:", error);
        }
      }, 1000); // 1s debounce

      saveTimeouts.current.set(session.id, timeout);
    }
  }, []);

  // Effect to auto-save sessions when they change
  // Also watch for OCR data updates which might happen silently
  useEffect(() => {
    sessions.forEach((session) => {
      // Now triggering save on image presence too
      if (
        (session.messages.length > 0 || session.imageData) &&
        session.type !== "settings"
      ) {
        saveSessionDebounced(session);
      }
    });
  }, [sessions, saveSessionDebounced]);

  // Open a chat from history
  const openChatFromHistory = useCallback(
    async (chatId: string) => {
      // Check if already in sessions
      const existingSession = sessions.find((s) => s.id === chatId);
      if (existingSession) {
        openSession(chatId);
        return;
      }

      // Load from storage
      try {
        const chatData = await loadChat(chatId);
        if (!chatData) return;

        const metadata = chatMetadata.find((c) => c.id === chatId);

        const session: ChatSession = {
          id: chatId,
          title: metadata?.title || "Chat",
          messages: chatData.messages,
          streamingText: "",
          firstResponseId: null,
          createdAt: metadata?.createdAt || Date.now(),
          type: "default",
          imageData: chatData.imageData,
          lensUrl: null,
          inputText: "",
          isLoading: false,
          error: null,
          ocrData: chatData.ocrData,
          isStarred: metadata?.isStarred,
          projectId: metadata?.projectId,
        };

        setSessions((prev) => [...prev, session]);
        setOpenTabIds((prev) => [...prev, chatId]);
        setActiveSessionId(chatId);
      } catch (error) {
        console.error("Failed to open chat from history:", error);
      }
    },
    [sessions, chatMetadata, openSession],
  );

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

  const updateSessionOCRData = useCallback(
    (sessionId: string, ocrData: { text: string; box: number[][] }[]) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id === sessionId) {
            const updated = { ...session, ocrData };
            // Trigger save immediately for OCR data
            saveSessionDebounced(updated);
            return updated;
          }
          return session;
        }),
      );
    },
    [saveSessionDebounced],
  );

  // Update state when metadata changes from outside (like starring in sidebar but tab is open)
  // This is handled by managing specific updates in the functions above (starSession, moveChatToProject)

  // --- Chat Logic ---

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
        const parsed = parseGeminiError(err);
        updateSession(sessionId, {
          isLoading: false,
          error: parsed.message,
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
        const parsed = parseGeminiError(err);
        updateSession(sessionId, {
          isLoading: false,
          error: parsed.message,
        });
      }
    },
    [updateSession],
  );

  const retryChatMessage = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      // Clear error to hide dialog.
      // The actual reload logic is handled by the UI component calling onRetry
      // which triggers the reload sequence (startChatSession)
      updateSession(sessionId, { error: null, isLoading: true });
    },
    [sessions, updateSession],
  );

  return {
    sessions,
    openTabs,
    openTabIds,
    activeSessionId,
    chatMetadata,
    projects,
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
    updateSessionOCRData,
    startChatSession,
    sendChatMessage,
    retryChatMessage,
    reorderTabs,
    pinSession,
    deleteSession,
    deleteSessions,
    renameSession,
    openChatFromHistory,
    saveSessionDebounced,
    starSession,
    createNewProject,
    moveChatToProject,
  };
};
