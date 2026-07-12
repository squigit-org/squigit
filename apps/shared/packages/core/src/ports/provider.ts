/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProviderStreamEvent } from "../brain/engine/types";

export interface StreamGeminiThreadInput extends Record<string, unknown> {
  apiKey: string;
  model: string;
  isInitialTurn: boolean;
  imagePath: string | null;
  imageDescription: string | null;
  userFirstMsg: string | null;
  historyLog: string | null;
  userMessage: string;
  channelId: string;
  threadId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  imageBrief?: string | null;
}

export type ProviderUnlisten = () => void;

export interface ProviderPort {
  streamThread(input: StreamGeminiThreadInput): Promise<void>;
  generateImageBrief(
    apiKey: string,
    imagePath: string,
    model?: string,
  ): Promise<string>;
  generateThreadTitle(
    apiKey: string,
    model: string,
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
