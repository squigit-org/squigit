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
  messageCount: number;
  hasImage: boolean;
}

export interface ChatsIndex {
  version: number;
  chats: ChatMetadata[];
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
export async function saveChatIndex(chats: ChatMetadata[]): Promise<void> {
  try {
    await ensureChatsDir();

    const index: ChatsIndex = {
      version: 1,
      chats,
    };

    await writeTextFile(INDEX_FILE, JSON.stringify(index, null, 2), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch (error) {
    console.error("Failed to save chat index:", error);
    throw error;
  }
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
      role: role === "assistant" ? "model" : role,
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
export async function loadChat(
  chatId: string,
): Promise<{
  messages: Message[];
  imageData: ChatSession["imageData"];
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

    return { messages, imageData };
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
  if (!session.messages || session.messages.length === 0) {
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

    // Update index
    const index = await loadChatIndex();
    const existingIndex = index.findIndex((c) => c.id === session.id);

    const metadata: ChatMetadata = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: Date.now(),
      isPinned: (session as any).isPinned || false,
      messageCount: session.messages.length,
      hasImage: !!session.imageData,
    };

    if (existingIndex >= 0) {
      index[existingIndex] = metadata;
    } else {
      index.unshift(metadata);
    }

    await saveChatIndex(index);
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
    const index = await loadChatIndex();
    const updatedIndex = index.filter((c) => c.id !== chatId);
    await saveChatIndex(updatedIndex);
  } catch (error) {
    console.error(`Failed to delete chat ${chatId}:`, error);
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
 * Group chats by date categories
 */
export function groupChatsByDate(
  chats: ChatMetadata[],
): Map<string, ChatMetadata[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const groups = new Map<string, ChatMetadata[]>();
  groups.set("Pinned", []);
  groups.set("Today", []);
  groups.set("Yesterday", []);
  groups.set("Last Week", []);
  groups.set("Last Month", []);
  groups.set("Older", []);

  for (const chat of chats) {
    if (chat.isPinned) {
      groups.get("Pinned")!.push(chat);
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
  if (groups.get("Pinned")!.length === 0) {
    groups.delete("Pinned");
  }

  return groups;
}
