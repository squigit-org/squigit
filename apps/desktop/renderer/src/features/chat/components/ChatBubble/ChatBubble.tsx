/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Check, Copy, RotateCcw, Pencil, ChevronRight } from "lucide-react";
import { CodeBlock, TextShimmer } from "@/components";
import { useAppContext } from "@/providers/AppProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { preprocessMarkdown, remarkDisableIndentedCode } from "@/lib";
import { useSmoothStream } from "../../hooks/useSmoothStream";
import {
  parseAttachmentPaths,
  stripAttachmentMentions,
  attachmentFromPath,
  AttachmentStrip,
  Message,
} from "@/features";
import styles from "./ChatBubble.module.css";

interface ChatBubbleProps {
  message: Message;
  isStreamed?: boolean;
  onStreamComplete?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  stopRequested?: boolean;
  onStopGeneration?: (truncatedText: string) => void;
  onRetry?: () => void;
  onUndo?: () => void;
  onAction?: (actionId: string, value?: string) => void;
  enableInternalLinks?: boolean;
}

function getBaseName(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}

const ChatBubbleComponent: React.FC<ChatBubbleProps> = ({
  message,
  isStreamed = false,
  onStreamComplete,
  onTypingChange,
  stopRequested,
  onStopGeneration,
  onRetry,
  onUndo,

  onAction,
  enableInternalLinks = false,
}) => {
  const app = useAppContext();
  const isUser = message.role === "user";
  const [isCopied, setIsCopied] = useState(false);

  const attachments = useMemo(() => {
    const paths = parseAttachmentPaths(message.text);
    return paths.map((p) => {
      const sourcePath = app.getAttachmentSourcePath(p) || undefined;
      const originalName = sourcePath ? getBaseName(sourcePath) : undefined;

      return attachmentFromPath(p, undefined, originalName, sourcePath);
    });
  }, [app.getAttachmentSourcePath, message.text]);

  const displayText = useMemo(() => {
    return stripAttachmentMentions(message.text);
  }, [message.text]);

  const isRichMarkdownUserMessage = useMemo(() => {
    if (!isUser) return false;
    return /(^|\n)\s*(#{1,6}\s|[-+*]\s|\d+\.\s|>\s|```|~~~|\$\$|\|.+\|)/m.test(
      displayText,
    );
  }, [displayText, isUser]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const isBotStreaming = !isUser && isStreamed && !message.stopped;
  
  const { text: smoothText, isWritingCode } = useSmoothStream(displayText, isBotStreaming);
  
  const prevIsTypingRef = useRef(false);

  useEffect(() => {
    if (prevIsTypingRef.current !== isBotStreaming) {
      prevIsTypingRef.current = isBotStreaming;
      onTypingChange?.(isBotStreaming);
      if (!isBotStreaming) {
        onStreamComplete?.();
      }
    }
  }, [isBotStreaming, onTypingChange, onStreamComplete]);

  useEffect(() => {
    return () => {
      if (prevIsTypingRef.current) {
        prevIsTypingRef.current = false;
        onTypingChange?.(false);
      }
    };
  }, [onTypingChange]);

  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!stopRequested) {
      stoppedRef.current = false;
    }
  }, [stopRequested]);

  useEffect(() => {
    if (!stopRequested || !isBotStreaming || stoppedRef.current) return;
    stoppedRef.current = true;
    onStopGeneration?.(smoothText.trimEnd());
  }, [stopRequested, isBotStreaming, smoothText, onStopGeneration]);

  const markdownComponents = useMemo(
    () => ({
      code({ node, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const isInline = !match && !String(children).includes("\n");

        if (!isInline) {
          return (
            <CodeBlock
              language={match ? match[1] : ""}
              value={String(children).replace(/\n$/, "")}
            />
          );
        }
        return (
          <code className={styles.inlineCode} {...props}>
            {children}
          </code>
        );
      },

      a: ({ node, href, onClick, children, ...props }: any) => {
        const isInternalSettingsLink =
          enableInternalLinks &&
          typeof href === "string" &&
          href.startsWith("#settings-");

        if (isInternalSettingsLink) {
          const section = href
            .replace("#settings-", "")
            .split(/[?#]/)[0]
            .trim()
            .toLowerCase();

          return (
            <span
              role="button"
              tabIndex={0}
              className={styles.link}
              style={{
                cursor: "pointer",
                fontWeight: 700,
                color: "var(--c-raw-011)",
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (section) onAction?.("open_settings", section);
              }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (section) onAction?.("open_settings", section);
                }
              }}
            >
              {children}
            </span>
          );
        }

        return (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
            onClick={onClick}
          >
            {children}
          </a>
        );
      },
      
      li({ checked, children, ...props }: any) {
        if (typeof checked === "boolean") {
          return (
            <li className={styles.taskListItem} {...props}>
              <input type="checkbox" checked={checked} disabled readOnly />
              {children}
            </li>
          );
        }
        return <li {...props}>{children}</li>;
      },

      details: ({ children }: any) => (
        <details className={styles.details}>{children}</details>
      ),
      
      summary: ({ children }: any) => (
        <summary className={styles.summary}>
          <ChevronRight className={styles.chevron} size={18} />
          {children}
        </summary>
      ),
    }),
    [enableInternalLinks, onAction],
  );

  const markdownToRender = isBotStreaming ? smoothText : displayText;

  const shouldDoubleNewlines = isUser && !isRichMarkdownUserMessage;

  return (
    <>
      <div
        className={`${styles.wrapper} ${
          isUser ? styles.userAlign : styles.botAlign
        }`}
      >
        <div
          className={`${styles.container} ${
            isUser ? styles.userContainer : styles.botContainer
          } ${isUser && isRichMarkdownUserMessage ? styles.userRichContainer : ""}`}
        >
          <div
            className={`${styles.contentColumn} ${
              isUser ? styles.userContent : styles.botContent
            } ${isUser && isRichMarkdownUserMessage ? styles.userRichContent : ""}`}
          >
            <div
              dir="auto"
              data-component="chat-bubble"
              data-message-index={message.id}
              data-message-role={isUser ? "user" : "assistant"}
              className={`${styles.bubble} ${
                isUser ? styles.userBubble : styles.botBubble
              } ${
                isUser && isRichMarkdownUserMessage ? styles.userRichBubble : ""
              } ${isBotStreaming ? styles.liveStream : ""}`}
            >
              {attachments.length > 0 && (
                <div
                  style={{
                    marginBottom: displayText.length > 0 ? "8px" : "0",
                  }}
                >
                  <AttachmentStrip
                    attachments={attachments}
                    onClick={app.openMediaViewer}
                    readOnly
                  />
                </div>
              )}
              <div className={isUser ? `${styles.markdownContent} ${styles.userMarkdownContent}` : styles.markdownContent}>
                <ReactMarkdown
                  remarkPlugins={[
                    remarkGfm,
                    remarkMath,
                    remarkDisableIndentedCode,
                  ]}
                  rehypePlugins={[rehypeKatex, rehypeRaw]}
                  components={markdownComponents}
                >
                  {preprocessMarkdown(markdownToRender, {
                    doubleNewlines: shouldDoubleNewlines,
                  })}
                </ReactMarkdown>
                {isWritingCode && <TextShimmer text="Writing code..." />}
              </div>
            </div>

            {message.image && (
              <div className={styles.imageWrapper}>
                <img
                  src={
                    message.image.startsWith("data:")
                      ? message.image
                      : `data:image/jpeg;base64,${message.image}`
                  }
                  alt="Analyzed content"
                  className={styles.image}
                />
                <div className={styles.imageCaption}>Analyzed image</div>
              </div>
            )}

            <div
              className={`${styles.footer} ${
                isUser ? styles.userFooter : styles.botFooter
              }`}
            >
              {isUser && (
                <span className={styles.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}

              {isBotStreaming || message.role === "system" ? null : (
                <>
                  {!isUser && onRetry && (
                    <button onClick={onRetry} title="Retry" aria-label="Retry">
                      <RotateCcw size={14} />
                    </button>
                  )}
                  <button onClick={handleCopy} title="Copy" aria-label="Copy">
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  {isUser && onUndo && (
                    <button
                      onClick={onUndo}
                      title="Undo and Edit"
                      aria-label="Undo and Edit"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const ChatBubble = React.memo(
  ChatBubbleComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.text === nextProps.message.text &&
      prevProps.isStreamed === nextProps.isStreamed &&
      prevProps.stopRequested === nextProps.stopRequested &&
      !!prevProps.onRetry === !!nextProps.onRetry &&
      !!prevProps.onUndo === !!nextProps.onUndo &&
      prevProps.enableInternalLinks === nextProps.enableInternalLinks
    );
  },
);
