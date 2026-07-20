/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HarnessPrepareTextFirstMessageInput {
  messageText: string;
  textAttachmentPaths: string[];
  threadId?: string | null;
}

export interface HarnessTextAttachment {
  path: string;
  displayName: string;
  extension: string;
  charCount: number;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface HarnessTextFirstMessage {
  messageText: string;
  attachments: HarnessTextAttachment[];
  consumedPaths: string[];
}

export interface HarnessPort {
  prepareTextFirstMessage(
    input: HarnessPrepareTextFirstMessageInput,
  ): Promise<HarnessTextFirstMessage>;
}

let harnessPort: HarnessPort | null = null;

export function setHarnessPort(port: HarnessPort): void {
  harnessPort = port;
}

export function getHarnessPort(): HarnessPort {
  if (!harnessPort) {
    throw new Error("HarnessPort is not initialized");
  }

  return harnessPort;
}
