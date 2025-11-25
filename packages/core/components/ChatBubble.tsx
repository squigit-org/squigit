/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { Message } from "../types";
import "katex/dist/katex.min.css";

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
          <code
            className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200"
            {...props}
          >
            {children}
          </code>
        );
      },

      a: ({ node, ...props }: any) => (
        <a
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        />
      ),
    }),
    []
  );

  return (
    <div
      className={`group flex w-full ${
        isUser ? "justify-end" : "justify-start"
      } `}
    >
      <div
        className={`flex max-w-[85%] min-w-0 ${
          isUser ? "flex-row-reverse" : "flex-row"
        } gap-3`}
      >
        <div
          className={`flex flex-col min-w-0 ${
            isUser ? "items-end" : "items-start"
          }`}
        >
          <div
            dir="auto"
            className={`w-full rounded-2xl px-4 py-3 text-sm text-neutral-100 leading-relaxed backdrop-blur-md shadow-lg ${
              isUser
                ? "bg-neutral-800/50 border border-neutral-700"
                : "bg-transparent border-none"
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {message.text}
            </ReactMarkdown>
          </div>

          {message.image && (
            <div className="mt-2 w-full max-w-[220px] overflow-hidden rounded-2xl border border-neutral-800-80 bg-neutral-900-70">
              <img
                src={
                  message.image.startsWith("data:")
                    ? message.image
                    : `data:image/jpeg;base64,${message.image}`
                }
                alt="Analyzed content"
                className="h-auto w-full object-cover"
              />
              <div className="border-t border-neutral-800-60 bg-neutral-900 px-3 py-2 text-center text-xs text-neutral-400">
                Analyzed image
              </div>
            </div>
          )}

          <div
            className={`mt-1.5 flex items-center gap-2 ${
              isUser ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {isUser && (
              <span className="text-xs text-neutral-500">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}

            <button
              onClick={handleCopy}
              className="flex items-center justify-center p-1 text-neutral-500 transition-colors duration-200 hover:text-neutral-300"
              title="Copy markdown"
              aria-label="Copy message"
            >
              {isCopied ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
