/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { brainSessionStore } from "../../../session/store";
import type { ProviderStreamEvent } from "../../../engine/types";
import {
  cancelCurrentRequest,
  clearActiveProviderTransport,
  createProviderChannelId,
  createStreamWatchdog,
} from "../transport";
import { setUserFirstMsg, addToHistory } from "../../../session/context";
import { buildContextWindow } from "../../../session/summarizer";
import { listenGeminiStream, streamGeminiThread } from "../commands";
import { requireNonEmptyProviderResponse } from "./responseGuard";
import type { ModelAttemptPlan } from "../../../../config/models-config";

export const sendMessage = async (
  text: string,
  userMessageId: string,
  modelCandidates: ModelAttemptPlan,
  onToken?: (token: string) => void,
  threadId?: string | null,
  onEvent?: (event: ProviderStreamEvent) => void,
): Promise<string> => {
  if (!brainSessionStore.storedApiKey)
    throw new Error("Gemini API Key not set");
  if (!brainSessionStore.imageDescription)
    throw new Error("No active thread session");

  brainSessionStore.currentModelId = modelCandidates[0] ?? "";

  const myGenId = brainSessionStore.generationId;
  setUserFirstMsg(text);
  addToHistory("User", text);

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
      onToken?.(token);
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
    console.log(`[GeminiClient] Sending Message`);
    console.log(
      `[GeminiClient] Model candidates: ${modelCandidates.join(", ")}`,
    );
    console.log(
      `[GeminiClient] Image Hash Available: ${Boolean(brainSessionStore.storedImagePath)}`,
    );

    const { historyLog } = buildContextWindow();
    const providerApiKey = brainSessionStore.storedApiKey;
    if (!providerApiKey) {
      throw new Error("Gemini API Key not set");
    }

    streamWatchdog.touch();
    await Promise.race([
      streamGeminiThread({
        apiKey: providerApiKey,
        modelCandidates: [...modelCandidates],
        isInitialTurn: false,
        imagePath: null, // Image never re-sent, brief is used instead
        imageDescription: brainSessionStore.imageDescription,
        userFirstMsg: brainSessionStore.userFirstMsg,
        historyLog,
        userMessage: text,
        userMessageId,
        channelId: channelId,
        threadId: threadId ?? null,
        userName: brainSessionStore.userName ?? undefined,
        userEmail: brainSessionStore.userEmail ?? undefined,
      }),
      streamWatchdog.stallPromise,
    ]);
    streamWatchdog.stop();
    clearActiveProviderTransport(channelId, unlisten);

    if (brainSessionStore.generationId !== myGenId)
      throw new Error("CANCELLED");

    const finalResponse = requireNonEmptyProviderResponse(fullResponse);
    addToHistory("Assistant", finalResponse);

    console.log(
      `[GeminiClient] Stream Completed. Final Response: "${finalResponse}"`,
    );
    return finalResponse;
  } catch (error) {
    streamWatchdog.stop();
    clearActiveProviderTransport(channelId, unlisten);
    if (error instanceof Error && error.message === "CANCELLED") throw error;
    console.error("SendMessage error:", error);
    throw error;
  }
};
