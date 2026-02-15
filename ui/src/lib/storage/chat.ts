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
  pinned_at: string | null;
  ocr_lang?: string;
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

/** Overwrite all messages in a chat. */
export async function overwriteChatMessages(
  chatId: string,
  messages: ChatMessage[],
): Promise<void> {
  return invoke("overwrite_chat_messages", { chatId, messages });
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
// Helpers
// =============================================================================

type ChatGroupKey = "Starred" | "Recents";

/** Group chats by Starred and Recents. */
export function groupChatsByDate(
  chats: ChatMetadata[],
): Map<ChatGroupKey, ChatMetadata[]> {
  const groups = new Map<ChatGroupKey, ChatMetadata[]>();

  // Initialize group arrays
  groups.set("Starred", []);
  groups.set("Recents", []);

  for (const chat of chats) {
    let targetGroup: ChatGroupKey = "Recents";

    // 1. Starred takes precedence
    if (chat.is_starred) {
      targetGroup = "Starred";
    }

    groups.get(targetGroup)?.push(chat);
  }

  groups.forEach((groupChats) => {
    groupChats.sort((a, b) => {
      // 1. Pinned check
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      // 2. If both pinned, sort by pinned_at desc
      if (a.is_pinned && b.is_pinned) {
        const pinnedA = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
        const pinnedB = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
        return pinnedB - pinnedA;
      }

      // 3. Date check (created_at descending)
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  });

  return groups;
}
