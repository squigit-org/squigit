/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from "react";
import { Dialog } from "../../../../components/ui";
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
      prompt,
      showUpdate,
      setShowUpdate,
      messages,
    },
    ref
  ) => {
    return (
      <div className="flex-1 overflow-y-auto" ref={ref}>
        <main>
          <div className="mx-auto w-full max-w-4xl px-4 md:px-8 pb-12">
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

            <Dialog
              isOpen={!!error}
              variant="error"
              title="Connection Error"
              message={error || ""}
              actions={[
                {
                  label: "Check Settings",
                  onClick: onCheckSettings,
                  variant: "secondary",
                },
                {
                  label: "Retry",
                  onClick: onRetry,
                  variant: "danger",
                  disabled: !startupImage || !prompt,
                },
              ]}
            />

            <Dialog
              isOpen={showUpdate}
              variant="update"
              title="New Update Available"
              message="Version 1.2.0 is available with better caching."
              actions={[
                {
                  label: "Maybe Later",
                  onClick: () => setShowUpdate(false),
                  variant: "secondary",
                },
                {
                  label: "Update Now",
                  onClick: () => {
                    alert("Backend not connected yet!");
                    setShowUpdate(false);
                  },
                  variant: "primary",
                },
              ]}
            />

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
                    <div key={msg.id} className="mb-8">
                      <ChatBubble message={msg} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }
);

ChatArea.displayName = "ChatArea";
