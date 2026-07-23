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
import {
  setImageDescription,
  addToHistory,
} from "../../../session/context";
import { buildContextWindow } from "../../../session/summarizer";
import { prepareBrainInput } from "../../../attachments";
import {
  listenGeminiStream,
  streamGeminiThread,
} from "../commands";
import type { ModelAttemptPlan } from "../../../../config/models-config";
import { requireNonEmptyProviderResponse } from "./responseGuard";

export const retryFromMessage = async (
  messageIndex: number,
  allMessages: Array<{ id: string; role: string; text: string }>,
  modelCandidates: ModelAttemptPlan,
  threadId?: string | null,
  onToken?: (token: string) => void,
  fallbackImagePath?: string,
  onEvent?: (event: ProviderStreamEvent) => void,
): Promise<string> => {
  if (!brainSessionStore.storedApiKey)
    throw new Error("Gemini API Key not set");

  console.log("[GeminiClient] Retrying Message", {
    messageIndex,
    modelCandidates,
  });

  brainSessionStore.currentModelId = modelCandidates[0] ?? "";
  const myGenId = brainSessionStore.generationId;

  if (!brainSessionStore.storedImagePath && fallbackImagePath) {
    brainSessionStore.storedImagePath = fallbackImagePath;
  }

  if (messageIndex === 0) {
    if (!brainSessionStore.storedImagePath) {
      throw new Error("Image not found");
    }

    brainSessionStore.imageDescription = null;
    brainSessionStore.userFirstMsg = null;
    brainSessionStore.conversationHistory = [];

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
      streamWatchdog.touch();
      const providerApiKey = brainSessionStore.storedApiKey;
      if (!providerApiKey) {
        throw new Error("Gemini API Key not set");
      }
      console.log("[GeminiClient] Sending Retry Prompt", {
        prompt: "Initial screenshot analysis",
        modelCandidates,
      });
      await Promise.race([
        streamGeminiThread({
          apiKey: providerApiKey,
          modelCandidates: [...modelCandidates],
          isInitialTurn: true,
          imagePath: brainSessionStore.storedImagePath,
          imageDescription: null,
          userFirstMsg: null,
          historyLog: null,
          userMessage: "",
          userMessageId: null,
          channelId,
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
      console.log("[GeminiClient] Generated Message:", finalResponse);
      setImageDescription(finalResponse);
      brainSessionStore.conversationHistory = [
        { role: "Assistant", content: finalResponse },
      ];

      return finalResponse;
    } catch (error) {
      streamWatchdog.stop();
      clearActiveProviderTransport(channelId, unlisten);
      throw error;
    }
  }

  const imgDesc =
    allMessages[0]?.text || brainSessionStore.imageDescription || "";
  brainSessionStore.imageDescription = imgDesc;

  const messagesBefore = allMessages.slice(0, messageIndex);
  const preparedMessagesBefore = [];
  let firstPreparedUserText: string | null = null;
  let lastPreparedUserText: string | null = null;
  for (const message of messagesBefore) {
    let text = message.text;
    if (message.role === "user") {
      text = (await prepareBrainInput(message.text, threadId)).brainText;
      firstPreparedUserText ??= text;
      lastPreparedUserText = text;
    }
    preparedMessagesBefore.push({
      role: message.role,
      text,
    });
  }
  brainSessionStore.userFirstMsg = firstPreparedUserText;

  brainSessionStore.conversationHistory = preparedMessagesBefore.map((m) => ({
    role: m.role === "user" ? "User" : "Assistant",
    content: m.text,
  }));
  // No more slice(-6) — summarize.ts handles windowing

  if (!lastPreparedUserText) {
    throw new Error("No user message found before the retried message");
  }
  const retryUserMessage = lastPreparedUserText;
  const retryUserMessageId = messagesBefore
    .slice()
    .reverse()
    .find((message) => message.role === "user")?.id;
  if (!retryUserMessageId) {
    throw new Error(
      "No persisted user message ID found before the retried message",
    );
  }

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
    const { historyLog } = buildContextWindow();
    const providerApiKey = brainSessionStore.storedApiKey;
    if (!providerApiKey) {
      throw new Error("Gemini API Key not set");
    }

    console.log("[GeminiClient] Sending Retry Prompt", {
      prompt: retryUserMessage,
      modelCandidates,
    });
    streamWatchdog.touch();
    await Promise.race([
      streamGeminiThread({
        apiKey: providerApiKey,
        modelCandidates: [...modelCandidates],
        isInitialTurn: false,
        imagePath: null, // Image never re-sent, brief is used instead
        imageDescription: imgDesc,
        userFirstMsg: brainSessionStore.userFirstMsg,
        historyLog,
        userMessage: retryUserMessage,
        userMessageId: retryUserMessageId,
        channelId,
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
    console.log("[GeminiClient] Generated Message:", finalResponse);
    addToHistory("Assistant", finalResponse);

    return finalResponse;
  } catch (error) {
    streamWatchdog.stop();
    clearActiveProviderTransport(channelId, unlisten);
    throw error;
  }
};
