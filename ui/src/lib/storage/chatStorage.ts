/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";

// =============================================================================
// Types
// =============================================================================

/** Metadata for a chat session (matches Rust ChatMetadata). */
export interface ChatMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  image_hash: string;
  is_pinned: boolean;
  is_starred: boolean;
  project_id: string | null;
}

/** A single chat message (matches Rust ChatMessage). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** OCR data for an image region (matches Rust OcrRegion). */
export interface OcrRegion {
  text: string;
  bbox: number[][];
}

/** Complete chat data (matches Rust ChatData). */
export interface ChatData {
  metadata: ChatMetadata;
  messages: ChatMessage[];
  ocr_data: OcrRegion[];
  imgbb_url: string | null;
}

/** Project for grouping chats (matches Rust Project). */
export interface Project {
  id: string;
  name: string;
  created_at: string;
}

/** Result from storing an image (matches Rust StoredImage). */
export interface StoredImage {
  hash: string;
  path: string;
}

/** Result from clipboard image read. */
export interface ImageResult {
  hash: string;
  path: string;
}

// =============================================================================
// Image Storage Commands
// =============================================================================

/** Store image bytes and return hash + path. */
export async function storeImageBytes(bytes: number[]): Promise<StoredImage> {
  return invoke("store_image_bytes", { bytes });
}

/** Store image from file path and return hash + path. */
export async function storeImageFromPath(path: string): Promise<StoredImage> {
  return invoke("store_image_from_path", { path });
}

/** Get the path to a stored image by its hash. */
export async function getImagePath(hash: string): Promise<string> {
  return invoke("get_image_path", { hash });
}

// =============================================================================
// Chat Commands
// =============================================================================

/** Create a new chat with the given image hash. */
export async function createChat(
  title: string,
  imageHash: string,
): Promise<ChatMetadata> {
  return invoke("create_chat", { title, imageHash });
}

/** Load a chat by ID (full data including messages). */
export async function loadChat(chatId: string): Promise<ChatData> {
  return invoke("load_chat", { chatId });
}

/** List all chats (metadata only). */
export async function listChats(): Promise<ChatMetadata[]> {
  return invoke("list_chats");
}

/** Delete a chat by ID. */
export async function deleteChat(chatId: string): Promise<void> {
  return invoke("delete_chat", { chatId });
}

/** Update chat metadata (rename, pin, star, etc.). */
export async function updateChatMetadata(
  metadata: ChatMetadata,
): Promise<void> {
  return invoke("update_chat_metadata", { metadata });
}

/** Append a message to a chat. */
export async function appendChatMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  return invoke("append_chat_message", { chatId, role, content });
}

// =============================================================================
// OCR Commands
// =============================================================================

/** Save OCR data for a chat. */
export async function saveOcrData(
  chatId: string,
  ocrData: OcrRegion[],
): Promise<void> {
  return invoke("save_ocr_data", { chatId, ocrData });
}

/** Get OCR data for a chat. */
export async function getOcrData(chatId: string): Promise<OcrRegion[]> {
  return invoke("get_ocr_data", { chatId });
}

// =============================================================================
// ImgBB Commands
// =============================================================================

/** Save imgbb URL for a chat. */
export async function saveImgbbUrl(chatId: string, url: string): Promise<void> {
  return invoke("save_imgbb_url", { chatId, url });
}

/** Get imgbb URL for a chat. */
export async function getImgbbUrl(chatId: string): Promise<string | null> {
  return invoke("get_imgbb_url", { chatId });
}

// =============================================================================
// Project Commands
// =============================================================================

/** List all projects. */
export async function listProjects(): Promise<Project[]> {
  return invoke("list_projects");
}

/** Create a new project. */
export async function createProject(name: string): Promise<Project> {
  return invoke("create_project", { name });
}

/** Delete a project. */
export async function deleteProject(projectId: string): Promise<void> {
  return invoke("delete_project", { projectId });
}

// =============================================================================
// Helpers
// =============================================================================

type DateGroup =
  | "Favorites"
  | "Pinned"
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Older"
  | `Project:${string}`;

/** Group chats by date and special categories. */
export function groupChatsByDate(
  chats: ChatMetadata[],
  projects: Project[],
): Map<DateGroup, ChatMetadata[]> {
  const groups = new Map<DateGroup, ChatMetadata[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Initialize group arrays
  groups.set("Favorites", []);
  groups.set("Pinned", []);
  projects.forEach((p) => groups.set(`Project:${p.name}`, []));
  groups.set("Today", []);
  groups.set("Yesterday", []);
  groups.set("Last Week", []);
  groups.set("Last Month", []);
  groups.set("Older", []);

  for (const chat of chats) {
    // Starred chats go to Favorites
    if (chat.is_starred) {
      groups.get("Favorites")!.push(chat);
      continue;
    }

    // Pinned chats go to Pinned
    if (chat.is_pinned) {
      groups.get("Pinned")!.push(chat);
      continue;
    }

    // Project chats
    if (chat.project_id) {
      const project = projects.find((p) => p.id === chat.project_id);
      if (project) {
        groups.get(`Project:${project.name}`)!.push(chat);
        continue;
      }
    }

    // Date-based grouping
    const updatedAt = new Date(chat.updated_at);
    if (updatedAt >= today) {
      groups.get("Today")!.push(chat);
    } else if (updatedAt >= yesterday) {
      groups.get("Yesterday")!.push(chat);
    } else if (updatedAt >= lastWeek) {
      groups.get("Last Week")!.push(chat);
    } else if (updatedAt >= lastMonth) {
      groups.get("Last Month")!.push(chat);
    } else {
      groups.get("Older")!.push(chat);
    }
  }

  return groups;
}
