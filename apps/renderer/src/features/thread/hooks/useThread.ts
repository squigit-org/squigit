/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "@squigit/core/brain/engine";
import { useBrainSession } from "@squigit/react/brain/hooks";

export const useThread = ({
  apiKey,
  currentModel,
  startupImage,
  setCurrentModel,
  enabled,
  onMessage,
  onOverwriteMessages,
  threadId,
  threadTitle,
  onMissingApiKey,
  onTitleGenerated,
  generateTitle,
  userName,
  userEmail,
}: {
  apiKey: string;
  currentModel: string;
  startupImage: {
    path: string;
    mimeType: string;
    imageId: string;
    fromHistory?: boolean;
  } | null;
  setCurrentModel: (model: string) => void;
  enabled: boolean;
  onMessage?: (message: Message, threadId: string) => void;
  onOverwriteMessages?: (messages: Message[]) => void;
  threadId: string | null;
  threadTitle: string;
  onMissingApiKey?: () => void;
  onTitleGenerated?: (title: string) => void;
  generateTitle?: (text: string) => Promise<string>;
  userName?: string;
  userEmail?: string;
}) => {
  return useBrainSession({
    apiKey,
    currentModel,
    startupImage,
    setCurrentModel,
    enabled,
    onMissingApiKey,
    onMessage,
    onOverwriteMessages,
    threadId,
    threadTitle,
    onTitleGenerated,
    generateTitle,
    userName,
    userEmail,
  });
};
