/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProviderStreamEvent } from "../brain/engine/types";

export interface StreamGeminiThreadInput extends Record<string, unknown> {
  apiKey: string;
  modelCandidates: string[];
  isInitialTurn: boolean;
  imagePath: string | null;
  imageDescription: string | null;
  userFirstMsg: string | null;
  historyLog: string | null;
  userMessage: string;
  userMessageId: string | null;
  attachmentPreflightToken?: string | null;
  channelId: string;
  threadId: string | null;
  userName?: string | null;
  userEmail?: string | null;
}

export interface PrepareAttachmentInput {
  jobId: string;
  sourcePath: string;
}

export interface AttachmentPreparationResult {
  job_id: string;
  attachment_hash?: string | null;
  cas_path?: string | null;
  file_type?:
    | "text_local"
    | "image_upload"
    | "document_upload"
    | null;
  status: "pending" | "ready" | "failed" | "cancelled";
  disposition?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

export interface SubmissionAttachmentResult {
  attachment_hash: string;
  file_type?:
    | "text_local"
    | "image_upload"
    | "document_upload"
    | null;
  status: "pending" | "ready" | "failed" | "cancelled";
  disposition?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

export interface PrepareSubmissionAttachmentsInput {
  preflightId: string;
  threadId: string;
  userMessageId: string;
  hashes: string[];
}

export interface PrepareSubmissionAttachmentsResult {
  preflight_token?: string | null;
  results: SubmissionAttachmentResult[];
}

export type ProviderUnlisten = () => void;

export interface ProviderPort {
  streamThread(input: StreamGeminiThreadInput): Promise<string>;
  prepareAttachment(
    input: PrepareAttachmentInput,
  ): Promise<AttachmentPreparationResult>;
  cancelAttachment(jobId: string): Promise<void>;
  prepareSubmissionAttachments(
    input: PrepareSubmissionAttachmentsInput,
  ): Promise<PrepareSubmissionAttachmentsResult>;
  generateThreadTitle(
    apiKey: string,
    modelCandidates: string[],
    promptContext: string,
  ): Promise<string>;
  cancelRequest(channelId: string | null): Promise<void>;
  requestQuickAnswer(channelId: string): Promise<void>;
  listenToStream(
    channelId: string,
    onEvent: (event: ProviderStreamEvent) => void,
  ): Promise<ProviderUnlisten>;
}

let providerPort: ProviderPort | null = null;

export function setProviderPort(port: ProviderPort): void {
  providerPort = port;
}

export function getProviderPort(): ProviderPort {
  if (!providerPort) {
    throw new Error("ProviderPort is not initialized");
  }

  return providerPort;
}
