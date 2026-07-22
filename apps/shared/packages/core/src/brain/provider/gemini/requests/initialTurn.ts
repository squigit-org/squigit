/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { brainSessionStore } from "../../../session/store";
import type { ProviderStreamEvent } from "../../../engine/types";
import {
  resetBrainContext,
  setImageDescription,
  addToHistory,
} from "../../../session/context";
import {
  cancelCurrentRequest,
  clearActiveProviderTransport,
  createProviderChannelId,
  createStreamWatchdog,
} from "../transport";
import {
  listenGeminiStream,
  streamGeminiThread,
} from "../commands";
import type { ModelAttemptPlan } from "../../../../config/models-config";
import { requireNonEmptyProviderResponse } from "./responseGuard";

export const startNewThreadStream = async (
  modelCandidates: ModelAttemptPlan,
  microTaskCandidates: ModelAttemptPlan,
  imagePath: string,
  onToken: (token: string) => void,
  threadId?: string | null,
  userName?: string,
  userEmail?: string,
  onEvent?: (event: ProviderStreamEvent) => void,
): Promise<string> => {
  if (!brainSessionStore.storedApiKey)
    throw new Error("Gemini API Key not set");

  cancelCurrentRequest();
  brainSessionStore.currentAbortController = new AbortController();
  brainSessionStore.currentModelId = modelCandidates[0] ?? "";
  const myGenId = brainSessionStore.generationId;

  resetBrainContext();
  brainSessionStore.storedImagePath = imagePath;

  const channelId = createProviderChannelId();
  brainSessionStore.currentChannelId = channelId;
  let fullResponse = "";
  const streamWatchdog = createStreamWatchdog(() => cancelCurrentRequest());

  const unlisten = await listenGeminiStream(channelId, (payload) => {
    if (brainSessionStore.generationId !== myGenId) return;
    streamWatchdog.touch();
    const normalizedPayload = payload as ProviderStreamEvent & {
      type?: ProviderStreamEvent["type"];
      token?: string;
    };
    if (!normalizedPayload?.type || normalizedPayload.type === "token") {
      const token = normalizedPayload.token || "";
      fullResponse += token;
      onToken(token);
      onEvent?.({ type: "token", token });
      return;
    }
    if (normalizedPayload.type === "reset") {
      fullResponse = "";
      onEvent?.(normalizedPayload as ProviderStreamEvent);
      return;
    }
    onEvent?.(normalizedPayload as ProviderStreamEvent);
  });
  brainSessionStore.currentUnlisten = unlisten;

  try {
    console.log(`[GeminiClient] Starting New Stream`);
    console.log(`[GeminiClient] Model candidates:`, modelCandidates);

    streamWatchdog.touch();
    const providerApiKey = brainSessionStore.storedApiKey;
    if (!providerApiKey) {
      throw new Error("Gemini API Key not set");
    }
    await Promise.race([
      streamGeminiThread({
        apiKey: providerApiKey,
        modelCandidates: [...modelCandidates],
        isInitialTurn: true,
        imagePath,
        imageDescription: null,
        userFirstMsg: null,
        historyLog: null,
        userMessage: "",
        channelId: channelId,
        threadId: threadId ?? null,
        userName,
        userEmail,
      }),
      streamWatchdog.stallPromise,
    ]);
    streamWatchdog.stop();

    clearActiveProviderTransport(channelId, unlisten);
    brainSessionStore.currentAbortController = null;

    if (brainSessionStore.generationId !== myGenId)
      throw new Error("CANCELLED");

    const finalResponse = requireNonEmptyProviderResponse(fullResponse);
    setImageDescription(finalResponse);
    addToHistory("Assistant", finalResponse);

    console.log(
      `[GeminiClient] Stream Completed successfully. Length: ${finalResponse.length} chars.`,
    );
    console.log("[GeminiClient] Generated Message:", finalResponse);
    return finalResponse;
  } catch (error) {
    streamWatchdog.stop();
    clearActiveProviderTransport(channelId, unlisten);
    brainSessionStore.currentAbortController = null;
    if (error instanceof Error && error.message === "CANCELLED") throw error;
    console.error("Backend stream error:", error);
    throw error;
  }
};

export const startNewThread = async (
  modelCandidates: ModelAttemptPlan,
  microTaskCandidates: ModelAttemptPlan,
  imagePath: string,
  threadId?: string | null,
): Promise<string> => {
  let fullText = "";
  await startNewThreadStream(
    modelCandidates,
    microTaskCandidates,
    imagePath,
    (token) => {
      fullText += token;
    },
    threadId,
  );
  return fullText;
};
