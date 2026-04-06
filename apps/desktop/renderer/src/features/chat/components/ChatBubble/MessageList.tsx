/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Message,
  PendingAssistantTurn,
} from "../../chat.types";
import { ChatBubble } from "./ChatBubble";
import { TextShimmer } from "@/components";
import { API_STATUS_TEXT } from "@/lib";
import styles from "./MessageList.module.css";

const THINKING_LABEL = "Thinking";

interface MessageListProps {
  messages: Message[];
  pendingAssistantTurn?: PendingAssistantTurn | null;
  hideThinkingProgress?: boolean;
  selectedModel: string;
  onAnswerNow?: () => void;
  onRetryMessage?: (messageId: string, modelId?: string) => void;
  onUndoMessage?: (messageId: string) => void;
  onSystemAction?: (actionId: string, value?: string) => void;
}

function isAnswerNowEligibleProgress(text: string | undefined): boolean {
  if (!text) return false;

  return [
    API_STATUS_TEXT.SEARCHING_RELEVANT_SOURCES,
    API_STATUS_TEXT.SEARCHED_WEB,
    API_STATUS_TEXT.TRYING_ANOTHER_RELIABLE_SOURCE,
    API_STATUS_TEXT.TRYING_ANOTHER_SOURCE,
    API_STATUS_TEXT.FETCHING_SOURCE_FAILED,
    API_STATUS_TEXT.SEARCH_UNAVAILABLE_CONTEXT,
  ].some((status) => text.startsWith(status));
}

function getVisibleProgressText(text: string | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed || trimmed === THINKING_LABEL) {
    return null;
  }
  return trimmed;
}

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  pendingAssistantTurn,
  hideThinkingProgress = false,
  selectedModel,
  onAnswerNow,
  onRetryMessage,
  onUndoMessage,
  onSystemAction,
}) => {
  const shouldShowThinkingLabel =
    pendingAssistantTurn?.phase === "thinking" && !hideThinkingProgress;
  const visibleProgressText =
    shouldShowThinkingLabel
      ? getVisibleProgressText(pendingAssistantTurn?.progressText)
      : null;
  const hasRunningToolStep =
    pendingAssistantTurn?.toolSteps.some((step) => step.status === "running") ??
    false;
  const showAnswerNow =
    shouldShowThinkingLabel &&
    !!onAnswerNow &&
    !!pendingAssistantTurn &&
    pendingAssistantTurn.phase === "thinking" &&
    (hasRunningToolStep ||
      isAnswerNowEligibleProgress(pendingAssistantTurn.progressText));

  return (
    <div className={styles.container}>
      {pendingAssistantTurn && (
        <div className={styles.item}>
          <div className={styles.pendingTurn}>
            {shouldShowThinkingLabel && (
              <div className={styles.pendingProgress}>
                <div className={styles.progressRow}>
                  <TextShimmer text={THINKING_LABEL} compact={true} />
                  {showAnswerNow && (
                    <button
                      type="button"
                      className={styles.answerNowButton}
                      onClick={onAnswerNow}
                    >
                      {API_STATUS_TEXT.ANSWER_NOW_BUTTON}
                    </button>
                  )}
                </div>

                {visibleProgressText && (
                  <p
                    key={visibleProgressText}
                    className={styles.progressText}
                    aria-live="polite"
                  >
                    {visibleProgressText}
                  </p>
                )}
              </div>
            )}

            {pendingAssistantTurn.phase !== "thinking" && (
              <ChatBubble
                message={{
                  id: pendingAssistantTurn.id,
                  role: "model",
                  text: pendingAssistantTurn.displayText,
                  timestamp: pendingAssistantTurn.requestStartedAtMs,
                  thoughtSeconds: pendingAssistantTurn.thoughtSeconds,
                  citations: pendingAssistantTurn.visibleCitations,
                  toolSteps: pendingAssistantTurn.toolSteps,
                  stopped: pendingAssistantTurn.stopped,
                }}
                pendingTurn={pendingAssistantTurn}
                onRetry={onRetryMessage ? () => {} : undefined}
                retryDisabled={true}
                copyDisabled={pendingAssistantTurn.displayText.trim().length === 0}
              />
            )}
          </div>
        </div>
      )}

      {messages
        .slice()
        .reverse()
        .map((msg) => (
          <div key={msg.id} className={styles.item}>
            <ChatBubble
              message={msg}
              onRetry={
                msg.role !== "user" && onRetryMessage
                  ? () => onRetryMessage(msg.id, selectedModel)
                  : undefined
              }
              onUndo={
                msg.role === "user" && onUndoMessage
                  ? () => onUndoMessage(msg.id)
                  : undefined
              }
              onAction={msg.role === "system" ? onSystemAction : undefined}
            />
          </div>
        ))}
    </div>
  );
};

export const MessageList = React.memo(
  MessageListComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.messages === nextProps.messages &&
      prevProps.pendingAssistantTurn === nextProps.pendingAssistantTurn &&
      prevProps.hideThinkingProgress === nextProps.hideThinkingProgress &&
      prevProps.selectedModel === nextProps.selectedModel
    );
  },
);
