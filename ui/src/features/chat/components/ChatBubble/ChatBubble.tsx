/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import { CodeBlock } from "../../../syntax";
import { Message } from "../../types/chat.types";
import styles from "./ChatBubble.module.css";
import "katex/dist/katex.min.css";
import { remarkDisableIndentedCode } from "../../markdownPlugins";

interface ChatBubbleProps {
  message: Message;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === "user";
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath, remarkDisableIndentedCode]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {message.text}
            </ReactMarkdown>
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

            <button onClick={handleCopy} title="Copy" aria-label="Copy">
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
