/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { getStoragePort } from "../ports/storage";

// =============================================================================
// Types
// =============================================================================

/** Metadata for a thread session (matches Rust ThreadMetadata). */
export interface ThreadMetadata {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  image_hash: string;
  is_pinned: boolean;
  ocr_lang?: string;
  image_tone?: string | null;
  reverse_image_search_url?: string | null;
}

/** A single thread message (matches Rust ThreadMessage). */
export interface ThreadCitation {
  title: string;
  url: string;
  summary: string;
  favicon_url?: string;
  favicon_base64?: string;
}

/** Tool timeline step metadata persisted with assistant messages. */
export interface ThreadToolStep {
  id: string;
  name: string;
  status: string;
  args?: Record<string, unknown>;
  message?: string | null;
  startedAtMs?: number;
  endedAtMs?: number;
}

/** A single thread message (matches Rust ThreadMessage). */
export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: ThreadCitation[];
  tool_steps?: ThreadToolStep[];
}

/** OCR data for an image region (matches Rust OcrRegion). */
export interface OcrRegion {
  text: string;
  bbox: number[][];
}

/** OCR frame: keyed by model_id, each value is cached results or null (not scanned). */
export type OcrFrame = Record<string, OcrRegion[] | null>;

/**
 * Special OCR frame key used to persist "do not auto-run OCR for this thread".
 * Manual OCR model selection still works.
 */
export const AUTO_OCR_DISABLED_MODEL_ID = "__meta_auto_ocr_disabled__";

/** Complete thread data (matches Rust ThreadData). */
export interface ThreadData {
  metadata: ThreadMetadata;
  messages: ThreadMessage[];
  ocr_data: OcrFrame;
  rolling_summary: string | null;
  image_brief?: string | null;
}

/** Ranked thread search hit returned by the local search engine. */
export interface ThreadSearchResult {
  thread_id: string;
  thread_title: string;
  thread_created_at: string;
  thread_updated_at: string;
  message_index: number;
  message_role: "user" | "assistant";
  message_timestamp: string;
  snippet: string;
  score: number;
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
  return getStoragePort().storeImageBytes(bytes);
}

/** Store image from file path and return hash + path. */
export async function storeImageFromPath(path: string): Promise<StoredImage> {
  return getStoragePort().storeImageFromPath(path);
}

/** Get the path to a stored image by its hash. */
export async function getImagePath(hash: string): Promise<string> {
  return getStoragePort().getImagePath(hash);
}

// =============================================================================
// Thread Commands
// =============================================================================

/** Create a new thread with the given image hash. */
export async function createThread(
  title: string,
  imageHash: string,
  ocrLang?: string | null,
): Promise<ThreadMetadata> {
  return getStoragePort().createThread(title, imageHash, ocrLang);
}

/** Load a thread by ID (full data including messages). */
export async function loadThread(threadId: string): Promise<ThreadData> {
  return getStoragePort().loadThread(threadId);
}

/** List all threads (metadata only). */
export async function listThreads(): Promise<ThreadMetadata[]> {
  return getStoragePort().listThreads();
}

/** Search local threads with ranking, fuzzy matching, and regex filtering. */
export async function searchThreads(
  query: string,
  limit = 60,
): Promise<ThreadSearchResult[]> {
  return getStoragePort().searchThreads(query, limit);
}

/** Delete a thread by ID. */
export async function deleteThread(threadId: string): Promise<void> {
  return getStoragePort().deleteThread(threadId);
}

/** Update thread metadata (rename, pin, etc.). */
export async function updateThreadMetadata(
  metadata: ThreadMetadata,
): Promise<void> {
  return getStoragePort().updateThreadMetadata(metadata);
}

/** Append a message to a thread. */
export async function appendThreadMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  return getStoragePort().appendThreadMessage(threadId, role, content);
}

/** Overwrite all messages in a thread. */
export async function overwriteThreadMessages(
  threadId: string,
  messages: ThreadMessage[],
): Promise<void> {
  return getStoragePort().overwriteThreadMessages(threadId, messages);
}

// =============================================================================
// OCR Commands
// =============================================================================

/** Save OCR data for a specific model. */
export async function saveOcrData(
  threadId: string,
  modelId: string,
  ocrData: OcrRegion[],
): Promise<void> {
  return getStoragePort().saveOcrData(threadId, modelId, ocrData);
}

/** Get OCR data for a specific model. */
export async function getOcrData(
  threadId: string,
  modelId: string,
): Promise<OcrRegion[] | null> {
  return getStoragePort().getOcrData(threadId, modelId);
}

/** Get the entire OCR frame for a thread. */
export async function getOcrFrame(threadId: string): Promise<OcrFrame> {
  return getStoragePort().getOcrFrame(threadId);
}

/** Initialize OCR frame with null values for given model IDs. */
export async function initOcrFrame(
  threadId: string,
  modelIds: string[],
): Promise<void> {
  return getStoragePort().initOcrFrame(threadId, modelIds);
}

/** Cancel the currently running OCR job. */
export async function cancelOcrJob(): Promise<void> {
  try {
    await getStoragePort().cancelOcrJob();
  } catch {
    // Ignore cancellation races (no active job, late teardown, etc.).
  }
}

// =============================================================================
// Reverse Image Search Commands
// =============================================================================

/** Save the reverse image search URL for a thread. */
export async function saveReverseImageSearchUrl(
  threadId: string,
  url: string,
): Promise<void> {
  return getStoragePort().saveReverseImageSearchUrl(threadId, url);
}

/** Get the reverse image search URL for a thread. */
export async function getReverseImageSearchUrl(
  threadId: string,
): Promise<string | null> {
  return getStoragePort().getReverseImageSearchUrl(threadId);
}

// =============================================================================
// Rolling Summary Commands
// =============================================================================

/** Save rolling summary for a thread. */
export async function saveRollingSummary(
  threadId: string,
  summary: string,
): Promise<void> {
  return getStoragePort().saveRollingSummary(threadId, summary);
}

// =============================================================================
// Tone and Brief Commands
// =============================================================================

/** Save detected image tone for a thread. */
export async function saveImageTone(
  threadId: string,
  tone: string,
): Promise<void> {
  return getStoragePort().saveImageTone(threadId, tone);
}

/** Save image brief for a thread. */
export async function saveImageBrief(
  threadId: string,
  brief: string,
): Promise<void> {
  return getStoragePort().saveImageBrief(threadId, brief);
}
