/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ThreadData,
  ThreadMessage,
  ThreadMetadata,
  ThreadSearchResult,
  OcrFrame,
  OcrRegion,
  StoredImage,
} from "../config/thread-storage";

export interface StoragePort {
  storeImageBytes(bytes: number[]): Promise<StoredImage>;
  storeImageFromPath(path: string): Promise<StoredImage>;
  getImagePath(hash: string): Promise<string>;
  createThread(
    title: string,
    imageHash: string,
    ocrLang?: string | null,
  ): Promise<ThreadMetadata>;
  loadThread(threadId: string): Promise<ThreadData>;
  listThreads(): Promise<ThreadMetadata[]>;
  searchThreads(query: string, limit: number): Promise<ThreadSearchResult[]>;
  deleteThread(threadId: string): Promise<void>;
  updateThreadMetadata(metadata: ThreadMetadata): Promise<void>;
  appendThreadMessage(
    threadId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void>;
  overwriteThreadMessages(
    threadId: string,
    messages: ThreadMessage[],
  ): Promise<void>;
  saveOcrData(
    threadId: string,
    modelId: string,
    ocrData: OcrRegion[],
  ): Promise<void>;
  getOcrData(threadId: string, modelId: string): Promise<OcrRegion[] | null>;
  getOcrFrame(threadId: string): Promise<OcrFrame>;
  initOcrFrame(threadId: string, modelIds: string[]): Promise<void>;
  cancelOcrJob(): Promise<void>;
  saveImgbbUrl(threadId: string, url: string): Promise<void>;
  getImgbbUrl(threadId: string): Promise<string | null>;
  saveRollingSummary(threadId: string, summary: string): Promise<void>;
  saveImageTone(threadId: string, tone: string): Promise<void>;
  saveImageBrief(threadId: string, brief: string): Promise<void>;
}

let storagePort: StoragePort | null = null;

export function setStoragePort(port: StoragePort): void {
  storagePort = port;
}

export function getStoragePort(): StoragePort {
  if (!storagePort) {
    throw new Error("StoragePort is not initialized");
  }

  return storagePort;
}
