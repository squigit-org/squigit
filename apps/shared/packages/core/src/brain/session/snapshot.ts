/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrainConversationEntry, BrainSessionSnapshot } from "../engine/types";
import { brainSessionStore } from "./store";

export function restoreBrainSession(
  modelId: string,
  savedImageDescription: string,
  savedUserFirstMsg: string | null,
  savedHistory: BrainConversationEntry[],
  savedImagePath: string | null,
) {
  brainSessionStore.currentModelId = modelId;
  brainSessionStore.imageDescription = savedImageDescription;
  brainSessionStore.userFirstMsg = savedUserFirstMsg;
  brainSessionStore.conversationHistory = savedHistory;
  brainSessionStore.storedImagePath = savedImagePath;
}

export function getBrainSessionSnapshot(): BrainSessionSnapshot {
  return {
    imageDescription: brainSessionStore.imageDescription,
    userFirstMsg: brainSessionStore.userFirstMsg,
    conversationHistory: [...brainSessionStore.conversationHistory],
    storedImagePath: brainSessionStore.storedImagePath,
    currentModelId: brainSessionStore.currentModelId,
  };
}
