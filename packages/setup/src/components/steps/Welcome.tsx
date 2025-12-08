/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { StepLayout } from "../StepLayout";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Props {
  isAgreed: boolean;
  setIsAgreed: (val: boolean) => void;
  onNext: () => void;
  onCancel: () => void;
}

export const Welcome: React.FC<Props> = ({
  isAgreed,
  setIsAgreed,
  onNext,
  onCancel,
}) => {
  const [markdownContent, setMarkdownContent] = useState<string>("");

  useEffect(() => {
    fetch("/instructions/macos.md")
      .then((res) => res.text())
      .then((text) => setMarkdownContent(text))
      .catch((err) => console.error("Failed to load instructions:", err));
  }, []);

  return (
    <StepLayout
      title="Setup Guide"
      description="Please review the following instructions carefully."
      icon={
        <img
          src="/assets/steps/emoji_u1f4c4.png"
          className="w-8 h-8 object-contain"
          alt="Guide"
        />
      }
      onNext={onNext}
      onCancel={onCancel}
      disableNext={!isAgreed}
    >
      <style>{`
        .radio-option {
            display: flex;
            align-items: center;
            margin: 8px 0;
            cursor: pointer;
            font-size: 13px;
        }

        .radio-option input[type="radio"] {
            margin-right: 8px;
            cursor: pointer;
        }

        /* Markdown Styles */
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; }
        .markdown-body h1 { font-size: 1.5em; }
        .markdown-body h2 { font-size: 1.25em; }
        .markdown-body h3 { font-size: 1.1em; }
        .markdown-body p { margin-bottom: 1em; }
        .markdown-body ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
        .markdown-body li { margin-bottom: 0.25em; }
        .markdown-body strong { font-weight: bold; }
        .markdown-body em { font-style: italic; }
        
        /* Fix top gap */
        .markdown-body > *:first-child { margin-top: 0 !important; }
      `}</style>
      <div className="flex flex-col h-full space-y-3">
        <div className="text-sm text-gray-700 shrink-0">
          This guide contains critical information about permissions and
          troubleshooting.
        </div>

        <div className="flex-1 min-h-0 border border-gray-300 bg-white p-4 eula-scroll font-sans text-sm leading-relaxed text-gray-600 select-text shadow-inner overflow-y-auto">
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {markdownContent}
            </ReactMarkdown>
          </div>
        </div>

        <div className="radio-group pt-1 shrink-0">
          <label className="radio-option">
            <input
              type="radio"
              name="agreement"
              value="accept"
              checked={isAgreed}
              onChange={() => setIsAgreed(true)}
            />
            <span>I have read and understand the instructions</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="agreement"
              value="decline"
              checked={!isAgreed}
              onChange={() => setIsAgreed(false)}
            />
            <span>I do not understand</span>
          </label>
        </div>
      </div>
    </StepLayout>
  );
};
