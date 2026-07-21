/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Message,
  MessageCollapseMode,
  PendingAssistantTurn,
} from "@squigit/core/brain/engine";
import { TextShimmer } from "@/components/ui";
import {
  API_STATUS_TEXT,
  ATTACHMENT_ANALYSIS_STATUS_DELAY_MS,
  getAttachmentAnalysisStatusText,
  isQuickAnswerSuppressedProgressText,
  type AttachmentAnalysisCounts,
} from "@squigit/core/helpers";
import { ThreadBubble } from "./ThreadBubble";
import styles from "./MessageList.module.css";
import { ThinkingOrb } from "thinking-orbs";

const THINKING_LABEL = "Thinking";

interface MessageListProps {
  activeThreadId?: string | null;
  messages: Message[];
  messageIndexOffset?: number;
  onPendingTurnLayoutChange?: () => void;
  pendingAssistantTurn?: PendingAssistantTurn | null;
  pendingPromptAttachmentAnalysis?: AttachmentAnalysisCounts | null;
  hideThinkingProgress?: boolean;
  selectedModel: string;
  getMessageCollapseMode?: (messageId: string) => MessageCollapseMode;
  onToggleMessageCollapse?: (messageId: string, nextExpanded: boolean) => void;
  onQuickAnswer?: () => void;
  onRetryMessage?: (messageId: string, modelId?: string) => void;
  onUndoMessage?: (messageId: string) => void;
  onForkMessage?: (messageIndex: number) => void | Promise<void>;
  onSystemAction?: (actionId: string, value?: string) => void;
}

function isQuickAnswerEligibleProgress(text: string | undefined): boolean {
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

function renderProgressText(text: string): React.ReactNode {
  const rateLimitCountdownMatch = text.match(
    /^(Model busy, retrying in )(\d+s)$/,
  );

  if (rateLimitCountdownMatch) {
    return (
      <p
        className={`${styles.progressText} ${styles.progressTextStatic}`}
        aria-live="polite"
      >
        {rateLimitCountdownMatch[1]}
        <span
          key={rateLimitCountdownMatch[2]}
          className={styles.progressCountdown}
        >
          {rateLimitCountdownMatch[2]}
        </span>
      </p>
    );
  }

  return (
    <p key={text} className={styles.progressText} aria-live="polite">
      {text}
    </p>
  );
}

const MessageListComponent: React.FC<MessageListProps> = ({
  activeThreadId,
  messages,
  messageIndexOffset = 0,
  onPendingTurnLayoutChange,
  pendingAssistantTurn,
  pendingPromptAttachmentAnalysis,
  hideThinkingProgress = false,
  selectedModel,
  getMessageCollapseMode,
  onToggleMessageCollapse,
  onQuickAnswer,
  onRetryMessage,
  onUndoMessage,
  onForkMessage,
  onSystemAction,
}) => {
  const [delayedAttachmentStatus, setDelayedAttachmentStatus] = React.useState<{
    turnId: string;
    text: string;
  } | null>(null);
  const pendingTurnRef = React.useRef<HTMLDivElement | null>(null);
  const realProgressTurnIdRef = React.useRef<string | null>(null);
  const shouldShowThinkingLabel =
    pendingAssistantTurn?.phase === "thinking" && !hideThinkingProgress;
  const directProgressText = shouldShowThinkingLabel
    ? getVisibleProgressText(pendingAssistantTurn?.progressText)
    : null;
  const delayedAttachmentProgressText = getAttachmentAnalysisStatusText(
    pendingPromptAttachmentAnalysis,
  );

  React.useEffect(() => {
    const turnId = pendingAssistantTurn?.id ?? null;
    const realProgressText = getVisibleProgressText(
      pendingAssistantTurn?.progressText,
    );

    if (!turnId || !shouldShowThinkingLabel) {
      realProgressTurnIdRef.current = null;
      setDelayedAttachmentStatus(null);
      return;
    }

    if (realProgressText) {
      realProgressTurnIdRef.current = turnId;
      setDelayedAttachmentStatus((previous) =>
        previous?.turnId === turnId ? null : previous,
      );
      return;
    }

    if (realProgressTurnIdRef.current !== turnId) {
      setDelayedAttachmentStatus((previous) =>
        previous?.turnId === turnId ? previous : null,
      );
    }
  }, [
    pendingAssistantTurn?.id,
    pendingAssistantTurn?.phase,
    pendingAssistantTurn?.progressText,
    shouldShowThinkingLabel,
  ]);

  React.useEffect(() => {
    const turnId = pendingAssistantTurn?.id;

    if (
      !turnId ||
      !shouldShowThinkingLabel ||
      !!directProgressText ||
      !delayedAttachmentProgressText ||
      realProgressTurnIdRef.current === turnId ||
      delayedAttachmentStatus?.turnId === turnId
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setDelayedAttachmentStatus((previous) => {
        if (previous?.turnId === turnId) {
          return previous;
        }

        return {
          turnId,
          text: delayedAttachmentProgressText,
        };
      });
    }, ATTACHMENT_ANALYSIS_STATUS_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    delayedAttachmentProgressText,
    delayedAttachmentStatus?.turnId,
    directProgressText,
    pendingAssistantTurn?.id,
    shouldShowThinkingLabel,
  ]);

  const visibleProgressText = directProgressText
    ? directProgressText
    : shouldShowThinkingLabel &&
        delayedAttachmentStatus?.turnId === pendingAssistantTurn?.id
      ? delayedAttachmentStatus.text
      : null;
  const hasRunningToolStep =
    pendingAssistantTurn?.toolSteps.some((step) => step.status === "running") ??
    false;
  const showQuickAnswer =
    shouldShowThinkingLabel &&
    !!onQuickAnswer &&
    !!pendingAssistantTurn &&
    pendingAssistantTurn.phase === "thinking" &&
    !isQuickAnswerSuppressedProgressText(visibleProgressText) &&
    (hasRunningToolStep ||
      isQuickAnswerEligibleProgress(pendingAssistantTurn.progressText));
  const latestMessageIdsByRole = React.useMemo(() => {
    let latestUserMessageId: string | null = null;
    let latestModelMessageId: string | null = null;

    for (const message of messages) {
      if (message.role === "user") {
        latestUserMessageId = message.id;
      } else if (message.role === "model") {
        latestModelMessageId = message.id;
      }
    }

    return {
      user: latestUserMessageId,
      model: latestModelMessageId,
    };
  }, [messages]);

  React.useEffect(() => {
    const element = pendingTurnRef.current;
    if (!element || !onPendingTurnLayoutChange) {
      return;
    }

    let frameId: number | null = null;
    const scheduleLayoutChange = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        onPendingTurnLayoutChange();
      });
    };

    scheduleLayoutChange();

    const observer = new ResizeObserver(() => {
      scheduleLayoutChange();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    onPendingTurnLayoutChange,
    pendingAssistantTurn?.id,
    shouldShowThinkingLabel,
  ]);

  return (
    <div className={styles.container}>
      {messages.map((msg, index) => {
        const messageIndex = messageIndexOffset + index;
        const roleCodeVisibilityKey =
          msg.role === "user"
            ? latestMessageIdsByRole.user
            : msg.role === "model"
              ? latestMessageIdsByRole.model
              : null;
        const hideCodeBlocksByDefault =
          msg.role === "user"
            ? roleCodeVisibilityKey !== null && msg.id !== roleCodeVisibilityKey
            : msg.role === "model"
              ? roleCodeVisibilityKey !== null &&
                msg.id !== roleCodeVisibilityKey
              : false;

        return (
          <div key={msg.id} className={styles.item}>
            <ThreadBubble
              threadId={activeThreadId}
              message={msg}
              messageIndex={messageIndex}
              collapseMode={getMessageCollapseMode?.(msg.id) ?? "none"}
              onToggleCollapse={onToggleMessageCollapse}
              hideCodeBlocksByDefault={hideCodeBlocksByDefault}
              roleCodeVisibilityKey={roleCodeVisibilityKey}
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
              onForkMessage={onForkMessage}
              onAction={msg.role === "system" ? onSystemAction : undefined}
            />
          </div>
        );
      })}

      {pendingAssistantTurn && (
        <div className={styles.item}>
          <div ref={pendingTurnRef} className={styles.pendingTurn}>
            {shouldShowThinkingLabel && (
              <div className={styles.pendingProgress}>
                <div className={styles.progressRow}>
                  <ThinkingOrb state="solving" size={20} />
                  <TextShimmer text={THINKING_LABEL} compact={true} />
                  {showQuickAnswer && (
                    <button
                      type="button"
                      className={styles.quickAnswerButton}
                      onClick={onQuickAnswer}
                    >
                      {API_STATUS_TEXT.QUICK_ANSWER_BUTTON}
                    </button>
                  )}
                </div>

                {visibleProgressText && renderProgressText(visibleProgressText)}
              </div>
            )}

            {pendingAssistantTurn.phase !== "thinking" && (
              <ThreadBubble
                threadId={activeThreadId}
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
                collapseMode="none"
                onRetry={onRetryMessage ? () => {} : undefined}
                retryDisabled={true}
                actionDisabled={
                  pendingAssistantTurn.displayText.trim().length === 0
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const MessageList = React.memo(
  MessageListComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.activeThreadId === nextProps.activeThreadId &&
      prevProps.messages === nextProps.messages &&
      prevProps.messageIndexOffset === nextProps.messageIndexOffset &&
      prevProps.onPendingTurnLayoutChange ===
        nextProps.onPendingTurnLayoutChange &&
      prevProps.pendingAssistantTurn === nextProps.pendingAssistantTurn &&
      prevProps.pendingPromptAttachmentAnalysis ===
        nextProps.pendingPromptAttachmentAnalysis &&
      prevProps.hideThinkingProgress === nextProps.hideThinkingProgress &&
      prevProps.selectedModel === nextProps.selectedModel &&
      prevProps.getMessageCollapseMode === nextProps.getMessageCollapseMode &&
      prevProps.onToggleMessageCollapse === nextProps.onToggleMessageCollapse &&
      prevProps.onForkMessage === nextProps.onForkMessage
    );
  },
);
