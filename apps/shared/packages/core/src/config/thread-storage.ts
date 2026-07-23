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
  pinned_at: string | null;
}

/** A sidebar workspace and its AI sandbox path. */
export interface WorkspaceMetadata {
  id: string;
  name: string;
  path: string | null;
  threads: Record<string, ThreadMetadata>;
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

export interface ThreadMessageAttachment {
  attachment_hash: string;
  source_path: string | null;
}

export interface ThreadUserMessage {
  id: string;
  role: "user";
  content: string;
  timestamp: string;
  attachments: ThreadMessageAttachment[];
}

export interface ThreadAssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  timestamp: string;
  citations: ThreadCitation[];
  tool_steps: ThreadToolStep[];
}

/** A strict role-discriminated persisted message (matches Rust ThreadMessage). */
export type ThreadMessage = ThreadUserMessage | ThreadAssistantMessage;

export type AttachmentFileType =
  | "text_local"
  | "image_upload"
  | "document_upload";

export interface AttachmentManifestEntry {
  attachment_hash: string;
  display_name: string;
  file_type: AttachmentFileType;
  file_brief: string | null;
  last_mention_at: string;
}

/** OCR data for an image region (matches Rust OcrRegion). */
export interface OcrRegion {
  text: string;
  bbox: number[][];
}

/** OCR output for a single PaddleOCR model. */
export interface OcrModelAnnotation {
  scanned_at?: string | null;
  ocr_data: OcrRegion[];
}

export type OcrAnnotationEntry = OcrModelAnnotation | OcrRegion[];

/** OCR annotations: keyed by sentinel/model_id. */
export type OcrAnnotations = Record<string, OcrAnnotationEntry>;

/**
 * Empty-state sentinel stored in every OCR annotations file.
 */
export const EMPTY_STATE_ASSET_ID = "__empty_state_asset__";

export interface ContextWindow {
  tokens_used: number;
  compacted_at?: string | null;
  compacted_context?: string | null;
}

export interface ReverseImageSearchCache {
  imgbb_url?: string | null;
  google_lens_url?: string | null;
  created_at?: string | null;
}

/** Complete thread data (matches Rust ThreadData). */
export interface ThreadData {
  metadata: ThreadMetadata;
  messages: ThreadMessage[];
  ocr_data: OcrAnnotations;
  context_window: ContextWindow;
  reverse_image_search: ReverseImageSearchCache;
  attachment_manifest: AttachmentManifestEntry[];
  image_tone?: string | null;
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
  workspaceId?: string | null,
  displayName?: string | null,
): Promise<ThreadMetadata> {
  return getStoragePort().createThread(
    title,
    imageHash,
    workspaceId,
    displayName,
  );
}

/** Register a path as a workspace. */
export async function createWorkspace(
  path: string,
): Promise<WorkspaceMetadata> {
  return getStoragePort().createWorkspace(path);
}

/** List workspaces with their nested thread metadata. */
export async function listWorkspaces(): Promise<WorkspaceMetadata[]> {
  return getStoragePort().listWorkspaces();
}

/** Move an existing thread to a workspace. */
export async function setThreadWorkspace(
  threadId: string,
  workspaceId: string,
): Promise<void> {
  return getStoragePort().setThreadWorkspace(threadId, workspaceId);
}

/** Load a thread by ID (full data including messages). */
export async function loadThread(threadId: string): Promise<ThreadData> {
  return getStoragePort().loadThread(threadId);
}

/** Fork a thread through the given message index. */
export async function forkThread(
  threadId: string,
  messageIndex: number,
): Promise<ThreadMetadata> {
  return getStoragePort().forkThread(threadId, messageIndex);
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
  message: ThreadMessage,
): Promise<void> {
  return getStoragePort().appendThreadMessage(threadId, message);
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

/** Get the entire OCR annotations for a thread. */
export async function getOcrAnnotations(
  threadId: string,
): Promise<OcrAnnotations> {
  return getStoragePort().getOcrAnnotations(threadId);
}

/** Initialize OCR annotations with null values for given model IDs. */
export async function initOcrAnnotations(
  threadId: string,
  modelIds: string[],
): Promise<void> {
  return getStoragePort().initOcrAnnotations(threadId, modelIds);
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

/** Save the reverse image search cache for a thread. */
export async function saveReverseImageSearchCache(
  threadId: string,
  imgbbUrl: string,
  googleLensUrl: string,
): Promise<void> {
  return getStoragePort().saveReverseImageSearchCache(
    threadId,
    imgbbUrl,
    googleLensUrl,
  );
}

/** Get the reverse image search cache for a thread. */
export async function getReverseImageSearchCache(
  threadId: string,
): Promise<ReverseImageSearchCache | null> {
  return getStoragePort().getReverseImageSearchCache(threadId);
}

// =============================================================================
// Tone Commands
// =============================================================================

export async function saveImageTone(
  threadId: string,
  tone: string,
): Promise<void> {
  return getStoragePort().saveImageTone(threadId, tone);
}
