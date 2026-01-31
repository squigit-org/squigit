/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { CodeBlock } from "../../../syntax";
import styles from "./ChatBubble.module.css";
import { remarkDisableIndentedCode } from "../../markdownPlugins";

export const StreamingResponse: React.FC<{ text: string }> = ({ text }) => {
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

  if (!text) return null;

  return (
    <div className={styles.streamingContainer} data-component="chat-bubble">
      <div className={`${styles.bubble} ${styles.botBubble}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkDisableIndentedCode]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
};
