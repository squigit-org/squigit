/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChatMetadata,
  Project,
  listChats,
  listProjects,
  deleteChat,
  updateChatMetadata as updateChatMeta,
  createProject as createProj,
  deleteProject as deleteProj,
} from "../lib/storage/chatStorage";

export const useChatHistory = () => {
  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshChats = useCallback(async () => {
    try {
      const chatList = await listChats();
      setChats(chatList);
    } catch (e) {
      console.error("Failed to load chats:", e);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const projectList = await listProjects();
      setProjects(projectList);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }, []);

  useEffect(() => {
    refreshChats();
    refreshProjects();
  }, [refreshChats, refreshProjects]);

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

    const updated = {
      ...chat,
      is_pinned: !chat.is_pinned,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateChatMeta(updated);
      setChats((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  const handleToggleStarChat = async (id: string) => {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;

    const updated = {
      ...chat,
      is_starred: !chat.is_starred,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateChatMeta(updated);
      setChats((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      console.error("Failed to toggle star:", e);
    }
  };

  const handleCreateProject = async (name: string): Promise<Project | null> => {
    try {
      const project = await createProj(name);
      setProjects((prev) => [...prev, project]);
      return project;
    } catch (e) {
      console.error("Failed to create project:", e);
      return null;
    }
  };

  const handleMoveChatToProject = async (
    chatId: string,
    projectId: string | undefined,
  ) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    // undefined/null means remove from project
    const updated = {
      ...chat,
      project_id: projectId || null,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateChatMeta(updated);
      setChats((prev) => prev.map((c) => (c.id === chatId ? updated : c)));
    } catch (e) {
      console.error("Failed to move chat:", e);
    }
  };

  return {
    chats,
    projects,
    activeSessionId,
    setActiveSessionId,
    isLoading,
    refreshChats,
    refreshProjects,
    handleDeleteChat,
    handleDeleteChats,
    handleRenameChat,
    handleTogglePinChat,
    handleToggleStarChat,
    handleCreateProject,
    handleMoveChatToProject,
  };
};
