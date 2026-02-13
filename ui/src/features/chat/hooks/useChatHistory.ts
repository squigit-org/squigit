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
} from "@/lib/storage";
const SYSTEM_PREFIX = "__system_";
const isOnboardingId = (id: string) => id.startsWith(SYSTEM_PREFIX);

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

      setChats(chatList.filter((c) => !isOnboardingId(c.id)));
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

  useEffect(() => {
    setActiveSessionId(null);
  }, [activeProfileId]);

  const handleDeleteChat = async (id: string) => {
    if (isOnboardingId(id)) return;
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
    const realIds = ids.filter((id) => !isOnboardingId(id));
    if (realIds.length === 0) return;
    try {
      await Promise.all(realIds.map((id) => deleteChat(id)));
      setChats((prev) => prev.filter((c) => !realIds.includes(c.id)));
      if (activeSessionId && realIds.includes(activeSessionId)) {
        setActiveSessionId(null);
      }
    } catch (e) {
      console.error("Failed to delete chats:", e);
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    if (isOnboardingId(id)) return;
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
    if (isOnboardingId(id)) return;
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
    if (isOnboardingId(id)) return;
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;

    const newStarredState = !chat.is_starred;
    const updated = {
      ...chat,
      is_starred: newStarredState,

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
