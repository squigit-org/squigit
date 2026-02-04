/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChatBubble, StreamingResponse, Message } from "@/features/chat";
import { parseGeminiError } from "@/lib/utils/errorParser";
import { Dialog, TextShimmer } from "@/widgets";

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
  onRetry: () => void;
  prompt: string;
  showUpdate: boolean;
  setShowUpdate: (show: boolean) => void;
  messages: Message[];
  onStreamComplete?: () => void;
}

const ChatAreaComponent = forwardRef<HTMLDivElement, ChatAreaProps>(
  (
    {
      startupImage,
      isChatMode,
      isLoading,
      streamingText,
      error,
      onRetry,
      messages,
      onStreamComplete,
    },
    ref,
  ) => {
    const hasMessages = messages.filter((m) => m.role === "user").length > 0;
    const [isErrorDismissed, setIsErrorDismissed] = useState(false);

    useEffect(() => {
      setIsErrorDismissed(false);
    }, [error]);

    return (
      <div
        className="flex-1 min-h-0 overflow-y-auto mr-2 custom-scrollbar"
        ref={ref}
        style={{ transform: "translateZ(0)" }}
      >
        <main>
          <div
            className={`mx-auto w-full max-w-[45rem] px-4 md:px-8 pb-4 ${
              hasMessages ? "pt-12" : "pt-20"
            }`}
          >
            {startupImage && !isChatMode && (
              <div className="min-h-[60vh]">
                {isLoading && !streamingText ? (
                  <TextShimmer variant="full" />
                ) : (
                  <StreamingResponse
                    text={streamingText}
                    onComplete={onStreamComplete}
                  />
                )}
              </div>
            )}

            {(() => {
              if (!error) return null;

              const parsedError = parseGeminiError(error);

              const getActions = () => {
                const actions: any[] = [];

                if (parsedError.actionType !== "DISMISS_ONLY") {
                  actions.push({
                    label: "Retry",
                    onClick: onRetry,
                    variant: "danger",
                  });
                } else {
                  actions.push({
                    label: "Dismiss",
                    onClick: () => setIsErrorDismissed(true),
                    variant: "secondary",
                  });
                }

                if (parsedError.actionType === "RETRY_OR_SETTINGS") {
                  actions.push({
                    label: "Change API Key",
                    onClick: () => {
                      setIsErrorDismissed(true);
                    },
                    variant: "secondary",
                  });
                }

                if (
                  parsedError.actionType === "RETRY_OR_LINK" &&
                  parsedError.meta?.link
                ) {
                  actions.push({
                    label: parsedError.meta.linkLabel || "Open Link",
                    onClick: () => {
                      invoke("open_external_url", {
                        url: parsedError.meta?.link,
                      });
                      setIsErrorDismissed(true);
                    },
                    variant: "secondary",
                  });
                }

                return actions;
              };

              return (
                <Dialog
                  isOpen={!!error && !isErrorDismissed}
                  variant="error"
                  title={parsedError.title}
                  message={parsedError.message}
                  actions={getActions()}
                />
              );
            })()}

            {isChatMode && (
              <div className="space-y-8 flex flex-col-reverse">
                {isLoading && <TextShimmer variant="simple" />}

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

ChatAreaComponent.displayName = "ChatArea";
export const ChatArea = React.memo(ChatAreaComponent);
