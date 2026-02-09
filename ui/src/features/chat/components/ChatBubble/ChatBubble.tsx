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
import { Check, Copy } from "lucide-react";
import { CodeBlock } from "@/primitives";
import { TextShimmer } from "@/primitives/text-shimmer";
import { Message } from "@/features/chat";
import { remarkDisableIndentedCode } from "@/features/chat/utils";
import {
  parseMarkdownToSegments,
  tokenizeSegments,
  type StreamSegment,
} from "@/lib/markdown";
import styles from "./ChatBubble.module.css";
import "katex/dist/katex.min.css";

interface ChatBubbleProps {
  message: Message;
  isStreamed?: boolean;
  onStreamComplete?: () => void;
}

const ChatBubbleComponent: React.FC<ChatBubbleProps> = ({
  message,
  isStreamed = false,
  onStreamComplete,
}) => {
  const isUser = message.role === "user";
  const [isCopied, setIsCopied] = useState(false);

  const [revealedCount, setRevealedCount] = useState(0);
  const [isStreamingComplete, setIsStreamingComplete] = useState(!isStreamed);
  const timeoutRef = useRef<number | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
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
            <TextShimmer text="Writing Code" />
          </div>
        );
      }

      return (
        <div key={index} className={isStreamed ? styles.popIn : undefined}>
          <CodeBlock
            language={segment.meta?.language || ""}
            value={segment.content}
            isStreaming={false}
          />
        </div>
      );
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
          <a
            key={index}
            href={segment.meta?.href}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
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
            }`}
          >
            {!isUser ? (
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
                {message.text}
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
            {isUser && (
              <span className={styles.timestamp}>
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}

            {!isStreamingComplete && isStreamed ? null : (
              <button onClick={handleCopy} title="Copy" aria-label="Copy">
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChatBubble = React.memo(
  ChatBubbleComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.text === nextProps.message.text &&
      prevProps.isStreamed === nextProps.isStreamed
    );
  },
);
