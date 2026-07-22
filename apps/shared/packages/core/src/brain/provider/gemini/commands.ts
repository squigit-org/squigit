/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getProviderPort,
  type StreamGeminiThreadInput,
} from "../../../ports/provider";
import type { ProviderStreamEvent } from "../../engine/types";

export type { StreamGeminiThreadInput };

export function streamGeminiThread(
  input: StreamGeminiThreadInput,
): Promise<void> {
  return getProviderPort().streamThread(input);
}

export function generateGeminiThreadTitle(
  apiKey: string,
  modelCandidates: readonly string[],
  promptContext: string,
): Promise<string> {
  return getProviderPort().generateThreadTitle(
    apiKey,
    [...modelCandidates],
    promptContext,
  );
}

export function cancelGeminiRequest(channelId: string | null): Promise<void> {
  return getProviderPort().cancelRequest(channelId);
}

export function requestGeminiQuickAnswer(channelId: string): Promise<void> {
  return getProviderPort().requestQuickAnswer(channelId);
}

export function listenGeminiStream(
  channelId: string,
  onEvent: (event: ProviderStreamEvent) => void,
): Promise<() => void> {
  return getProviderPort().listenToStream(channelId, (event) => {
    if (event.type === "debug") {
      const label = `[GeminiClient] ${event.phase}`;
      if (event.payload === undefined) {
        console.log(label, event.message);
      } else {
        console.log(label, event.message, event.payload);
      }
      return;
    }
    if (event.type === "token") {
      console.log("[GeminiClient] Generated chunk:", event.token);
    }
    onEvent(event);
  });
}
