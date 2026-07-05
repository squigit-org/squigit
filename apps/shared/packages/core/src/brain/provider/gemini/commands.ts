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
import { MODEL_IDS } from "../../../config/models-config";

export type { StreamGeminiThreadInput };

export function streamGeminiThread(
  input: StreamGeminiThreadInput,
): Promise<void> {
  return getProviderPort().streamThread(input);
}

export function generateGeminiImageBrief(
  apiKey: string,
  imagePath: string,
  model?: string,
): Promise<string> {
  return getProviderPort().generateImageBrief(apiKey, imagePath, model);
}

export function generateGeminiThreadTitle(
  apiKey: string,
  model: string,
  promptContext: string,
): Promise<string> {
  return getProviderPort().generateThreadTitle(apiKey, model, promptContext);
}

export function compressGeminiConversation(
  apiKey: string,
  imageBrief: string,
  historyToCompress: string,
): Promise<string> {
  return getProviderPort().compressConversation(
    apiKey,
    imageBrief,
    historyToCompress,
    MODEL_IDS.MICRO_TASKS,
  );
}

export function persistRollingSummary(
  threadId: string,
  summary: string,
): Promise<void> {
  return getProviderPort().persistRollingSummary(threadId, summary);
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
  return getProviderPort().listenToStream(channelId, onEvent);
}
