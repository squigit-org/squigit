/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChatMetadata,
  listChats,
  deleteChat,
  updateChatMetadata as updateChatMeta,
} from "@/lib/storage/chatStorage";

export const useChatHistory = (activeProfileId: string | null = null) => {
  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshChats = useCallback(async () => {
    if (!activeProfileId) {
      setChats([]);
      return;
    }
    setIsLoading(true);
    try {
      const chatList = await listChats();
      setChats(chatList);
    } catch (e) {
      console.error("Failed to load chats:", e);
      setChats([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeProfileId]);

  useEffect(() => {
    refreshChats();
  }, [refreshChats]);

  // Reset active session when profile changes
  useEffect(() => {
    setActiveSessionId(null);
  }, [activeProfileId]);

  const handleDeleteChat = async (id: string) => {
    try {
      await deleteChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
      }
    } catch (e) {
      console.error("Failed to delete chat:", e);
    }
  };

  const handleDeleteChats = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => deleteChat(id)));
      setChats((prev) => prev.filter((c) => !ids.includes(c.id)));
      if (activeSessionId && ids.includes(activeSessionId)) {
        setActiveSessionId(null);
      }
    } catch (e) {
      console.error("Failed to delete chats:", e);
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;

    const updated = {
      ...chat,
      title: newTitle,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateChatMeta(updated);
      setChats((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      console.error("Failed to rename chat:", e);
    }
  };

  const handleTogglePinChat = async (id: string) => {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;

    const newPinnedState = !chat.is_pinned;
    const updated = {
      ...chat,
      is_pinned: newPinnedState,
      pinned_at: newPinnedState ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateChatMeta(updated);
      setChats((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  const handleToggleStarChat = async (
    id: string,
    overrides?: Partial<ChatMetadata>,
  ) => {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;

    const newStarredState = !chat.is_starred;
    const updated = {
      ...chat,
      is_starred: newStarredState,
      // When moving between categories (Starred <-> Recents), always unpin.
      is_pinned: false,
      pinned_at: null,
      ...overrides,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateChatMeta(updated);
      setChats((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      console.error("Failed to toggle star:", e);
    }
  };

  return {
    chats,
    activeSessionId,
    setActiveSessionId,
    isLoading,
    refreshChats,
    handleDeleteChat,
    handleDeleteChats,
    handleRenameChat,
    handleTogglePinChat,
    handleToggleStarChat,
  };
};
