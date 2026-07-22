/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KeyboardEvent, RefObject } from "react";
import type { Attachment } from "@squigit/core/brain/attachments";
import type { ModelEffort, ModelId } from "@squigit/core/config";

export type ThreadSubmitHandler = () => void;

export type ThreadModelSelectHandler = (model: ModelId) => void;

export interface ThreadInputProps {
  startupImage: {
    path: string;
    mimeType: string;
    imageId: string;
  } | null;
  forceVisible?: boolean;
  isNavigating?: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: ThreadSubmitHandler;
  isLoading: boolean;
  isAiTyping?: boolean;
  isStoppable?: boolean;
  onStopGeneration?: () => void;
  placeholder?: string;
  variant?: "default" | "transparent";
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  selectedModel: ModelId;
  selectedEffort: ModelEffort;
  onModelChange: ThreadModelSelectHandler;
  onEffortChange: (effort: ModelEffort) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onCaptureToInput?: () => void;
  onPreviewAttachment?: (
    attachment: Attachment,
    index: number,
    images: Attachment[],
  ) => void | Promise<void>;
  rememberAttachmentSourcePath?: (
    storedPath: string,
    sourcePath: string,
  ) => void | Promise<void>;
  showScrollToBottomButton?: boolean;
  keepScrollToBottomButtonMounted?: boolean;
  scrollToBottomButtonRef?: RefObject<HTMLButtonElement | null>;
  onScrollToBottom?: () => void;
}
