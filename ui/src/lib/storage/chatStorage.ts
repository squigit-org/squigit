/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDirectory,
  exists,
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  remove,
  readFile,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { ChatSession, Message } from "../../features/chat/types/chat.types";

const CHATS_DIR = "chats";
const INDEX_FILE = "chats/index.json";

export interface ChatMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  isStarred?: boolean;
  projectId?: string;
  messageCount: number;
  hasImage: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface ChatsIndex {
  version: number;
  chats: ChatMetadata[];
  projects?: Project[];
}

/**
 * Initialize chats directory structure
 */
async function ensureChatsDir(): Promise<void> {
  try {
    const chatsExists = await exists(CHATS_DIR, {
      baseDir: BaseDirectory.AppConfig,
    });
    if (!chatsExists) {
      await mkdir(CHATS_DIR, {
        baseDir: BaseDirectory.AppConfig,
        recursive: true,
      });
    }
  } catch (error) {
    console.error("Failed to create chats directory:", error);
  }
}

/**
 * Load chat index (metadata for all chats)
 */
export async function loadChatIndex(): Promise<ChatMetadata[]> {
  try {
    await ensureChatsDir();

    const indexExists = await exists(INDEX_FILE, {
      baseDir: BaseDirectory.AppConfig,
    });

    if (!indexExists) {
      return [];
    }

    const content = await readTextFile(INDEX_FILE, {
      baseDir: BaseDirectory.AppConfig,
    });

    const index: ChatsIndex = JSON.parse(content);
    return index.chats || [];
  } catch (error) {
    console.error("Failed to load chat index:", error);
    return [];
  }
}

/**
 * Save chat index
 */
export async function saveChatIndex(
  chats: ChatMetadata[],
  projects?: Project[],
): Promise<void> {
  try {
    await ensureChatsDir();

    // Preserve existing projects if not provided
    let finalProjects = projects;
    if (!finalProjects) {
      const existing = await loadChatIndexData();
      finalProjects = existing.projects || [];
    }

    const index: ChatsIndex = {
      version: 1,
      chats,
      projects: finalProjects,
    };

    await writeTextFile(INDEX_FILE, JSON.stringify(index, null, 2), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch (error) {
    console.error("Failed to save chat index:", error);
    throw error;
  }
}

async function loadChatIndexData(): Promise<ChatsIndex> {
  try {
    await ensureChatsDir();
    const indexExists = await exists(INDEX_FILE, {
      baseDir: BaseDirectory.AppConfig,
    });
    if (!indexExists) return { version: 1, chats: [], projects: [] };

    const content = await readTextFile(INDEX_FILE, {
      baseDir: BaseDirectory.AppConfig,
    });
    return JSON.parse(content);
  } catch (error) {
    return { version: 1, chats: [], projects: [] };
  }
}

export async function loadProjects(): Promise<Project[]> {
  const data = await loadChatIndexData();
  return data.projects || [];
}

export async function createProject(name: string): Promise<Project> {
  const data = await loadChatIndexData();
  const projects = data.projects || [];

  const newProject: Project = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
  };

  projects.push(newProject);
  await saveChatIndex(data.chats, projects);
  return newProject;
}

/**
 * Convert messages to markdown format
 */
function messagesToMarkdown(messages: Message[]): string {
  let md = "";

  for (const msg of messages) {
    const role = msg.role === "user" ? "**User**" : "**Assistant**";
    const timestamp = new Date(msg.timestamp).toISOString();

    md += `## ${role}\n`;
    md += `<!-- id: ${msg.id} -->\n`;
    md += `<!-- timestamp: ${timestamp} -->\n\n`;

    if (msg.image) {
      md += `![image](${msg.image})\n\n`;
    }

    md += `${msg.text}\n\n---\n\n`;
  }

  return md;
}

/**
 * Parse markdown back to messages
 */
function markdownToMessages(md: string): Message[] {
  const messages: Message[] = [];
  const sections = md.split(/---\n\n/).filter((s) => s.trim());

  for (const section of sections) {
    const roleMatch = section.match(/^## \*\*(User|Assistant)\*\*/);
    if (!roleMatch) continue;

    const role = roleMatch[1].toLowerCase() as "user" | "model";
    const idMatch = section.match(/<!-- id: ([^>]+) -->/);
    const timestampMatch = section.match(/<!-- timestamp: ([^>]+) -->/);
    const imageMatch = section.match(/!\[image\]\(([^)]+)\)/);

    // Extract text after the metadata
    let text = section
      .replace(/^## \*\*(User|Assistant)\*\*\n/, "")
      .replace(/<!-- id: [^>]+ -->\n/, "")
      .replace(/<!-- timestamp: [^>]+ -->\n\n/, "")
      .replace(/!\[image\]\([^)]+\)\n\n/, "")
      .trim();

    const message: Message = {
      id: idMatch ? idMatch[1] : crypto.randomUUID(),
      role:
        (role as string) === "assistant" ? "model" : (role as "user" | "model"),
      text,
      timestamp: timestampMatch
        ? new Date(timestampMatch[1]).getTime()
        : Date.now(),
    };

    if (imageMatch) {
      message.image = imageMatch[1];
    }

    messages.push(message);
  }

  return messages;
}

/**
 * Get chat directory path
 */
function getChatDir(chatId: string): string {
  return `${CHATS_DIR}/${chatId}`;
}

/**
 * Load a full chat from storage
 */
export async function loadChat(chatId: string): Promise<{
  messages: Message[];
  imageData: ChatSession["imageData"];
  ocrData?: ChatSession["ocrData"];
} | null> {
  try {
    const chatDir = getChatDir(chatId);
    const chatFile = `${chatDir}/chat.md`;

    const chatExists = await exists(chatFile, {
      baseDir: BaseDirectory.AppConfig,
    });

    if (!chatExists) {
      return null;
    }

    const content = await readTextFile(chatFile, {
      baseDir: BaseDirectory.AppConfig,
    });

    const messages = markdownToMessages(content);

    // Try to load image data if exists
    let imageData: ChatSession["imageData"] = null;
    const imageMetaFile = `${chatDir}/image.json`;
    const imageMetaExists = await exists(imageMetaFile, {
      baseDir: BaseDirectory.AppConfig,
    });

    if (imageMetaExists) {
      const imageMeta = await readTextFile(imageMetaFile, {
        baseDir: BaseDirectory.AppConfig,
      });
      imageData = JSON.parse(imageMeta);
    }

    // Try to load ocr data if exists
    let ocrData: ChatSession["ocrData"] = undefined;
    const ocrFile = `${chatDir}/ocr.json`;
    const ocrExists = await exists(ocrFile, {
      baseDir: BaseDirectory.AppConfig,
    });

    if (ocrExists) {
      try {
        const ocrContent = await readTextFile(ocrFile, {
          baseDir: BaseDirectory.AppConfig,
        });
        ocrData = JSON.parse(ocrContent);
      } catch (e) {
        console.error("Failed to parse OCR cache", e);
      }
    }

    return { messages, imageData, ocrData };
  } catch (error) {
    console.error(`Failed to load chat ${chatId}:`, error);
    return null;
  }
}

/**
 * Save a chat to storage
 */
export async function saveChat(session: ChatSession): Promise<void> {
  // Don't save chats without messages
  // Save if we have messages OR an image (0-prompt chat support)
  if (
    (!session.messages || session.messages.length === 0) &&
    !session.imageData
  ) {
    return;
  }

  // Don't save settings tabs
  if (session.type === "settings") {
    return;
  }

  try {
    const chatDir = getChatDir(session.id);

    // Ensure chat directory exists
    const dirExists = await exists(chatDir, {
      baseDir: BaseDirectory.AppConfig,
    });
    if (!dirExists) {
      await mkdir(chatDir, {
        baseDir: BaseDirectory.AppConfig,
        recursive: true,
      });
    }

    // Save messages as markdown
    const chatFile = `${chatDir}/chat.md`;
    const markdown = messagesToMarkdown(session.messages);
    await writeTextFile(chatFile, markdown, {
      baseDir: BaseDirectory.AppConfig,
    });

    // Save image metadata if exists
    if (session.imageData) {
      const imageMetaFile = `${chatDir}/image.json`;
      await writeTextFile(imageMetaFile, JSON.stringify(session.imageData), {
        baseDir: BaseDirectory.AppConfig,
      });
    }

    // Save OCR Data if exists
    if (session.ocrData) {
      const ocrFile = `${chatDir}/ocr.json`;
      await writeTextFile(ocrFile, JSON.stringify(session.ocrData), {
        baseDir: BaseDirectory.AppConfig,
      });
    }

    // Update index
    const data = await loadChatIndexData();
    const index = data.chats;
    const existingIndex = index.findIndex((c) => c.id === session.id);

    // Keep existing metadata properties if updating
    const existingMeta =
      existingIndex >= 0 ? index[existingIndex] : ({} as ChatMetadata);

    const metadata: ChatMetadata = {
      ...existingMeta, // Preservation of isStarred, projectId, etc.
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: Date.now(),
      isPinned: (session as any).isPinned || existingMeta.isPinned || false,
      isStarred: session.isStarred || existingMeta.isStarred || false,
      projectId: session.projectId || existingMeta.projectId,
      messageCount: session.messages.length,
      hasImage: !!session.imageData,
    };

    if (existingIndex >= 0) {
      index[existingIndex] = metadata;
    } else {
      index.unshift(metadata);
    }

    await saveChatIndex(index, data.projects);
  } catch (error) {
    console.error(`Failed to save chat ${session.id}:`, error);
    throw error;
  }
}

/**
 * Delete a chat from storage
 */
export async function deleteChat(chatId: string): Promise<void> {
  try {
    const chatDir = getChatDir(chatId);

    const dirExists = await exists(chatDir, {
      baseDir: BaseDirectory.AppConfig,
    });

    if (dirExists) {
      await remove(chatDir, {
        baseDir: BaseDirectory.AppConfig,
        recursive: true,
      });
    }

    // Update index
    const data = await loadChatIndexData();
    const updatedIndex = data.chats.filter((c) => c.id !== chatId);
    await saveChatIndex(updatedIndex, data.projects);
  } catch (error) {
    console.error(`Failed to delete chat ${chatId}:`, error);
    throw error;
  }
}

/**
 * Bulk delete chats
 */
export async function deleteChats(chatIds: string[]): Promise<void> {
  try {
    const data = await loadChatIndexData();
    const remainingChats = data.chats.filter((c) => !chatIds.includes(c.id));

    // Save index first to update UI quickly
    await saveChatIndex(remainingChats, data.projects);

    // Delete files concurrently
    await Promise.all(
      chatIds.map(async (id) => {
        const chatDir = getChatDir(id);
        if (await exists(chatDir, { baseDir: BaseDirectory.AppConfig })) {
          await remove(chatDir, {
            baseDir: BaseDirectory.AppConfig,
            recursive: true,
          });
        }
      }),
    );
  } catch (error) {
    console.error("Failed to bulk delete chats:", error);
    throw error;
  }
}

/**
 * Rename a chat
 */
export async function renameChat(
  chatId: string,
  newTitle: string,
): Promise<void> {
  try {
    const index = await loadChatIndex();
    const chat = index.find((c) => c.id === chatId);

    if (chat) {
      chat.title = newTitle;
      chat.updatedAt = Date.now();
      await saveChatIndex(index);
    }
  } catch (error) {
    console.error(`Failed to rename chat ${chatId}:`, error);
    throw error;
  }
}

/**
 * Toggle pin status for a chat
 */
export async function pinChat(
  chatId: string,
  isPinned: boolean,
): Promise<void> {
  try {
    const index = await loadChatIndex();
    const chat = index.find((c) => c.id === chatId);

    if (chat) {
      chat.isPinned = isPinned;
      chat.updatedAt = Date.now();
      await saveChatIndex(index);
    }
  } catch (error) {
    console.error(`Failed to pin chat ${chatId}:`, error);
    throw error;
  }
}

/**
 * Toggle star status
 */
export async function starChat(
  chatId: string,
  isStarred: boolean,
): Promise<void> {
  try {
    const index = await loadChatIndex();
    const chat = index.find((c) => c.id === chatId);

    if (chat) {
      chat.isStarred = isStarred;
      chat.updatedAt = Date.now();
      await saveChatIndex(index);
    }
  } catch (error) {
    console.error(`Failed to star chat ${chatId}:`, error);
    throw error;
  }
}

/**
 * Add chat to project
 */
export async function setChatProject(
  chatId: string,
  projectId: string | undefined, // undefined to remove
): Promise<void> {
  try {
    const index = await loadChatIndex();
    const chat = index.find((c) => c.id === chatId);

    if (chat) {
      chat.projectId = projectId;
      chat.updatedAt = Date.now();
      await saveChatIndex(index);
    }
  } catch (error) {
    console.error(`Failed to pin chat ${chatId}:`, error);
    throw error;
  }
}

/**
 * Group chats by date categories
 */
export function groupChatsByDate(
  chats: ChatMetadata[],
  projects: Project[] = [],
): Map<string, ChatMetadata[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const groups = new Map<string, ChatMetadata[]>();

  // Initialize project groups
  projects.forEach((p) => {
    groups.set(`Project:${p.name}`, []);
  });

  groups.set("Favorites", []);
  groups.set("Pinned", []);
  groups.set("Today", []);
  groups.set("Yesterday", []);
  groups.set("Last Week", []);
  groups.set("Last Month", []);
  groups.set("Older", []);

  for (const chat of chats) {
    // Add to Project group if assigned
    if (chat.projectId) {
      const project = projects.find((p) => p.id === chat.projectId);
      if (project) {
        groups.get(`Project:${project.name}`)?.push(chat);
        // Chats in projects don't show in date lists to avoid duplication?
        // User request didn't specify. Usually projects are separate.
        // Let's assume projects are a primary grouping.
        continue;
      }
    }

    if (chat.isStarred) {
      groups.get("Favorites")!.push(chat);
    }

    if (chat.isPinned) {
      groups.get("Pinned")!.push(chat);
      continue;
    }

    // If starred but not pinned/project, still show in date?
    // Usually favorites is a filter or a top section.
    // Let's behave like Pinned: if Pinned, it's removed from date list.
    // If Starred, should it be removed? "add chat start under option pin" implies it's a property.
    // "Favorites" usually sits at top.
    if (chat.isStarred) {
      continue;
    }

    const chatDate = new Date(chat.updatedAt || chat.createdAt);

    if (chatDate >= today) {
      groups.get("Today")!.push(chat);
    } else if (chatDate >= yesterday) {
      groups.get("Yesterday")!.push(chat);
    } else if (chatDate >= lastWeek) {
      groups.get("Last Week")!.push(chat);
    } else if (chatDate >= lastMonth) {
      groups.get("Last Month")!.push(chat);
    } else {
      groups.get("Older")!.push(chat);
    }
  }

  // Remove empty groups (except Pinned which we'll always show if there are pins)
  // Remove empty groups (except Pinned/Favorites if relevant?)
  // Actually, we should clean up any empty standard groups
  const keysToDelete: string[] = [];
  groups.forEach((value, key) => {
    if (value.length === 0) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => groups.delete(key));

  return groups;
}
