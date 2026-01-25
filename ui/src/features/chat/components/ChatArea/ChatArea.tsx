/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from "react";
import { parseGeminiError } from "../../../../lib/utils/errorParser";
import { Dialog } from "../../../../components";
import { ChatBubble, StreamingResponse, Message } from "../..";
import styles from "./ChatArea.module.css";

interface ChatAreaProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  isChatMode: boolean;
  isLoading: boolean;
  streamingText: string;
  error: string | null;
  onCheckSettings: () => void;
  onRetry: () => void;
  prompt: string;
  showUpdate: boolean;
  setShowUpdate: (show: boolean) => void;
  messages: Message[];
}

export const ChatArea = forwardRef<HTMLDivElement, ChatAreaProps>(
  (
    {
      startupImage,
      isChatMode,
      isLoading,
      streamingText,
      error,
      onCheckSettings,
      onRetry,
      messages,
    },
    ref,
  ) => {
    return (
      <div className="flex-1 overflow-y-auto" ref={ref}>
        <main>
          <div className="mx-auto w-full max-w-[45rem] px-4 md:px-8 pb-40">
            {startupImage && !isChatMode && (
              <div className="min-h-[60vh]">
                {isLoading && !streamingText ? (
                  <div className="space-y-4 pt-8" aria-hidden="true">
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-1"]} w-3/4`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-2"]} w-full`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-3"]} w-full`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-4"]} w-5/6`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-5"]} w-1/2`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-6"]} w-3/4`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-7"]} w-4/5`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-8"]} w-2/3`}
                    />
                  </div>
                ) : (
                  <StreamingResponse text={streamingText} />
                )}
              </div>
            )}

            {/* Error Dialog handling */}
            {(() => {
              if (!error) return null;

              const parsedError = parseGeminiError(error);

              const getActions = () => {
                const actions: any[] = [];

                // Primary Action: Retry or Dismiss
                if (parsedError.actionType !== "DISMISS_ONLY") {
                  actions.push({
                    label: "Retry",
                    onClick: onRetry,
                    variant: "danger",
                  });
                } else {
                  actions.push({
                    label: "Dismiss",
                    onClick: onRetry, // Reuse onRetry to clear error -> reload/reset
                    variant: "secondary",
                  });
                }

                // Secondary Action: Settings or Link
                if (parsedError.actionType === "RETRY_OR_SETTINGS") {
                  actions.push({
                    label: "Change API Key",
                    onClick: onCheckSettings,
                    variant: "secondary",
                  });
                }

                if (
                  parsedError.actionType === "RETRY_OR_LINK" &&
                  parsedError.meta?.link
                ) {
                  actions.push({
                    label: parsedError.meta.linkLabel || "Open Link",
                    onClick: () =>
                      window.open(parsedError.meta?.link, "_blank"),
                    variant: "secondary",
                  });
                }

                return actions;
              };

              return (
                <Dialog
                  isOpen={!!error}
                  variant="error"
                  title={parsedError.title}
                  message={parsedError.message}
                  actions={getActions()}
                />
              );
            })()}

            {isChatMode && (
              <div className="space-y-8 flex flex-col-reverse">
                {isLoading && (
                  <div className="space-y-4 pt-8 pb-4" aria-hidden="true">
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-1"]} w-3/4`}
                    />
                    <div
                      className={`${styles["shimmer-line"]} ${styles["shimmer-line-2"]} w-full`}
                    />
                  </div>
                )}

                {messages
                  .slice()
                  .reverse()
                  .map((msg) => (
                    <div key={msg.id} className="mb-2">
                      <ChatBubble message={msg} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  },
);

ChatArea.displayName = "ChatArea";
