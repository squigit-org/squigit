/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy, RotateCcw, Pencil } from "lucide-react";
import katex from "katex";
import { CodeBlock } from "@/primitives";
import { TextShimmer } from "@/primitives/text-shimmer";

/**
 * Module-level KaTeX render cache.
 * Prevents re-running katex.renderToString() on every React re-render.
 */
const katexCache = new Map<string, string>();
function renderKatex(latex: string, displayMode: boolean): string {
  const key = `${displayMode ? "D" : "I"}:${latex}`;
  const cached = katexCache.get(key);
  if (cached !== undefined) return cached;
  const html = katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
  });
  katexCache.set(key, html);
  return html;
}
import { Message } from "@/features/chat";
import { remarkDisableIndentedCode } from "@/features/chat/utils";
import {
  parseMarkdownToSegments,
  tokenizeSegments,
  preprocessMarkdown,
  type StreamSegment,
} from "@/lib/markdown";
import styles from "./ChatBubble.module.css";
import "katex/dist/katex.min.css";
import { MessageEditor } from "./MessageEditor";

interface ChatBubbleProps {
  message: Message;
  isStreamed?: boolean;
  onStreamComplete?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  stopRequested?: boolean;
  onStopGeneration?: (truncatedText: string) => void;
  onRetry?: () => void;
  isRetrying?: boolean;
  onEdit?: (newText: string) => void;
}

const ChatBubbleComponent: React.FC<ChatBubbleProps> = ({
  message,
  isStreamed = false,
  onStreamComplete,
  onTypingChange,
  stopRequested,
  onStopGeneration,
  onRetry,
  isRetrying,
  onEdit,
}) => {
  const isUser = message.role === "user";
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editorValue, setEditorValue] = useState(message.text);
  const [bubbleWidth, setBubbleWidth] = useState<number | undefined>(undefined);
  const [bubbleHeight, setBubbleHeight] = useState<number | undefined>(
    undefined,
  );

  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleEditSubmit = () => {
    if (editorValue.trim() !== message.text) {
      onEdit?.(editorValue);
    }
    setIsEditing(false);
  };

  const [revealedCount, setRevealedCount] = useState(0);
  const [isStreamingComplete, setIsStreamingComplete] = useState(!isStreamed);
  const timeoutRef = useRef<number | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleEditStart = () => {
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      setBubbleWidth(Math.max(300, rect.width));
      setBubbleHeight(rect.height);
    }
    setEditorValue(message.text);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditorValue(message.text);
  };

  const { segments, tokens } = useMemo(() => {
    if (isUser) return { segments: [], tokens: [] };

    const backtickCount = (message.text.match(/```/g) || []).length;
    const isUnclosedCodeBlock = backtickCount % 2 === 1;

    const textToParse = isUnclosedCodeBlock
      ? message.text + "\n```"
      : message.text;

    const segs = parseMarkdownToSegments(textToParse);
    const toks = tokenizeSegments(segs);
    return { segments: segs, tokens: toks };
  }, [message.text, isUser]);

  useEffect(() => {
    if (isStreamed) {
      setRevealedCount(0);
      setIsStreamingComplete(false);
    } else {
      setIsStreamingComplete(true);
    }
  }, [isStreamed]);

  useEffect(() => {
    if (isStreamingComplete || !isStreamed) {
      if (isStreamed && !isStreamingComplete) {
        setIsStreamingComplete(true);
        onStreamComplete?.();
      }
      return;
    }

    if (revealedCount >= tokens.length) {
      setIsStreamingComplete(true);
      onStreamComplete?.();
      return;
    }

    const currentToken = tokens[revealedCount];
    const delay = currentToken?.delay ?? 25;

    timeoutRef.current = window.setTimeout(() => {
      setRevealedCount((prev) => prev + 1);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    revealedCount,
    tokens,
    isStreamingComplete,
    isStreamed,
    onStreamComplete,
  ]);

  const isTyping = isStreamed && !isStreamingComplete;
  const prevIsTypingRef = useRef(false);

  useEffect(() => {
    if (prevIsTypingRef.current !== isTyping) {
      prevIsTypingRef.current = isTyping;
      onTypingChange?.(isTyping);
    }
  }, [isTyping, onTypingChange]);

  useEffect(() => {
    if (isEditing && bubbleRef.current) {
      let parent = bubbleRef.current.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          parent.getAttribute("data-scroll-container") === "true"
        ) {
          const parentRect = parent.getBoundingClientRect();
          const bubbleRect = bubbleRef.current.getBoundingClientRect();
          const currentScrollTop = parent.scrollTop;
          const relativeTop = bubbleRect.top - parentRect.top;
          parent.scrollTo({
            top: currentScrollTop + relativeTop - 90,
            behavior: "instant",
          });
          break;
        }
        parent = parent.parentElement;
      }
    }
  }, [isEditing]);

  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!stopRequested || !isTyping || stoppedRef.current) return;
    stoppedRef.current = true;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const revealed = tokens.slice(0, revealedCount);
    const grouped = new Map<number, string[]>();
    revealed.forEach((token) => {
      if (!grouped.has(token.segmentIndex)) {
        grouped.set(token.segmentIndex, []);
      }
      grouped.get(token.segmentIndex)!.push(token.text);
    });

    let truncated = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const texts = grouped.get(i);
      if (!texts) break;

      if (seg.type === "codeblock") {
        let isEffectiveLast = true;
        for (let j = i + 1; j < segments.length; j++) {
          if (grouped.has(j)) {
            isEffectiveLast = false;
            break;
          }
        }
        if (isEffectiveLast) {
          break;
        }
        const lang = seg.meta?.language || "";
        truncated += "```" + lang + "\n" + seg.content + "\n```\n";
      } else if (seg.type === "mathblock") {
        let isEffectiveLast = true;
        for (let j = i + 1; j < segments.length; j++) {
          if (grouped.has(j)) {
            isEffectiveLast = false;
            break;
          }
        }
        if (isEffectiveLast) {
          break;
        }
        truncated += "$$\n" + seg.content + "\n$$\n";
      } else if (seg.type === "math") {
        truncated += "$" + texts.join("") + "$";
      } else {
        truncated += texts.join("");
      }
    }

    onStopGeneration?.(truncated.trimEnd());
  }, [stopRequested]);

  const revealedSegments = useMemo(() => {
    if (isUser) return new Map();

    const count =
      !isStreamed || isStreamingComplete ? tokens.length : revealedCount;

    const revealed = tokens.slice(0, count);
    const grouped = new Map<number, string[]>();

    revealed.forEach((token) => {
      if (!grouped.has(token.segmentIndex)) {
        grouped.set(token.segmentIndex, []);
      }
      grouped.get(token.segmentIndex)!.push(token.text);
    });

    return grouped;
  }, [tokens, revealedCount, isStreamingComplete, isStreamed, isUser]);

  const renderStreamSegment = (segment: StreamSegment, index: number) => {
    const revealedTexts = revealedSegments.get(index);
    if (!revealedTexts && !(!isStreamed || isStreamingComplete)) return null;

    if (segment.type === "codeblock") {
      const lang = (segment.meta?.language || "").toLowerCase();
      const isMathLang = [
        "latex",
        "tex",
        "math",
        "katex",
        "markdown",
        "md",
      ].includes(lang);

      const isTyping = isStreamed && !isStreamingComplete;

      let isEffectiveLast = true;
      for (let i = index + 1; i < segments.length; i++) {
        if (segments[i].content.trim().length > 0) {
          isEffectiveLast = false;
          break;
        }
      }

      if (isTyping && isEffectiveLast) {
        return (
          <div key={index} className="py-4">
            <TextShimmer
              text={isMathLang ? "Rendering Math" : "Writing Code"}
            />
          </div>
        );
      }

      // Code blocks with math-like languages → render with katex
      if (isMathLang) {
        try {
          const html = renderKatex(segment.content, true);
          return (
            <div
              key={index}
              className={`${styles.mathBlock} ${isStreamed ? styles.popIn : ""}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <pre key={index}>{segment.content}</pre>;
        }
      }

      return (
        <div key={index} className={isStreamed ? styles.popIn : undefined}>
          <CodeBlock
            language={segment.meta?.language || ""}
            value={segment.content}
          />
        </div>
      );
    }

    // --- Display math block ($$...$$) ---
    if (segment.type === "mathblock") {
      const isTyping = isStreamed && !isStreamingComplete;

      let isEffectiveLast = true;
      for (let i = index + 1; i < segments.length; i++) {
        if (segments[i].content.trim().length > 0) {
          isEffectiveLast = false;
          break;
        }
      }

      if (isTyping && isEffectiveLast) {
        return (
          <div key={index} className="py-4">
            <TextShimmer text="Rendering Math" />
          </div>
        );
      }

      try {
        const html = renderKatex(segment.content, true);
        return (
          <div
            key={index}
            className={`${styles.mathBlock} ${isStreamed ? styles.popIn : ""}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        return <pre key={index}>{segment.content}</pre>;
      }
    }

    // --- Inline math ($...$) ---
    if (segment.type === "math") {
      try {
        const html = renderKatex(
          revealedTexts ? revealedTexts.join("") : segment.content,
          false,
        );
        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        return (
          <code key={index} className={styles.inlineCode}>
            {segment.content}
          </code>
        );
      }
    }

    const content = revealedTexts ? revealedTexts.join("") : segment.content;

    switch (segment.type) {
      case "text":
        return <span key={index}>{content}</span>;

      case "bold":
        return <strong key={index}>{content}</strong>;

      case "italic":
        return <em key={index}>{content}</em>;

      case "code":
        return (
          <code key={index} className={styles.inlineCode}>
            {content}
          </code>
        );

      case "heading": {
        const level = segment.meta?.level || 1;
        return (
          <div
            key={index}
            className="font-bold my-2"
            style={{ fontSize: `${1.5 - level * 0.1}em` }}
          >
            {content}
          </div>
        );
      }

      case "listItem":
        return <li key={index}>{content}</li>;

      case "blockquote":
        return (
          <blockquote
            key={index}
            className="border-l-4 border-gray-300 pl-4 my-2 italic"
          >
            {content}
          </blockquote>
        );

      case "link":
        return (
          <a key={index} href={segment.meta?.href}>
            {content}
          </a>
        );

      case "break":
        return <br key={index} />;

      default:
        return <span key={index}>{content}</span>;
    }
  };

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

      a: ({ node, ...props }: any) => (
        <a
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        />
      ),
    }),
    [],
  );

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
          }`}
        >
          <div
            className={`${styles.contentColumn} ${
              isUser ? styles.userContent : styles.botContent
            }`}
          >
            <div
              dir="auto"
              data-component="chat-bubble"
              className={`${styles.bubble} ${
                isUser ? styles.userBubble : styles.botBubble
              } ${isEditing ? styles.editing : ""}`}
              ref={bubbleRef}
              style={
                isEditing && bubbleWidth
                  ? {
                      width: `${bubbleWidth}px`,
                      maxWidth: "none",
                      minHeight: bubbleHeight ? `${bubbleHeight}px` : undefined,
                    }
                  : undefined
              }
            >
              {isEditing ? (
                <MessageEditor
                  value={editorValue}
                  onChange={setEditorValue}
                  onConfirm={handleEditSubmit}
                  onCancel={handleEditCancel}
                  width={bubbleWidth}
                />
              ) : isRetrying ? (
                <TextShimmer text="Regenerating response..." />
              ) : !isUser ? (
                <div className="whitespace-pre-wrap">
                  {segments.map((segment, index) =>
                    renderStreamSegment(segment, index),
                  )}
                  {!isStreamingComplete && isStreamed && (
                    <span className={styles.cursor}>▋</span>
                  )}
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[
                    remarkGfm,
                    remarkMath,
                    remarkDisableIndentedCode,
                  ]}
                  rehypePlugins={[rehypeKatex]}
                  components={markdownComponents}
                >
                  {preprocessMarkdown(message.text, { doubleNewlines: isUser })}
                </ReactMarkdown>
              )}
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
              {isUser && !isEditing && (
                <span className={styles.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}

              {!isStreamingComplete && isStreamed ? null : isRetrying ||
                isEditing ? null : (
                <>
                  {!isUser && onRetry && (
                    <button onClick={onRetry} title="Retry" aria-label="Retry">
                      <RotateCcw size={14} />
                    </button>
                  )}
                  <button onClick={handleCopy} title="Copy" aria-label="Copy">
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  {isUser && onEdit && (
                    <button
                      onClick={handleEditStart}
                      title="Edit"
                      aria-label="Edit"
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
      // Compare existence, not reference — parent creates inline closures
      !!prevProps.onRetry === !!nextProps.onRetry &&
      prevProps.isRetrying === nextProps.isRetrying &&
      !!prevProps.onEdit === !!nextProps.onEdit
    );
  },
);
