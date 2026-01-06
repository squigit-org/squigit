/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import {
  savePreferences,
  defaultPreferences,
} from "../../../../lib/config/preferences";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { OnboardingLayout } from "../..";
import "katex/dist/katex.min.css";
import styles from "../../layouts/OnboardingLayout.module.css";

interface AgreementProps {
  osType: string;
  onNext: () => void;
  onCancel: () => void;
}

export const Agreement: React.FC<AgreementProps> = ({
  osType,
  onNext,
  onCancel,
}) => {
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isAgreed, setIsAgreed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch(`/data/instructions/${osType}.md`)
      .then((res) => {
        if (!res.ok) throw new Error("Instruction file not found");
        return res.text();
      })
      .then((text) => setMarkdownContent(text))
      .catch((err) => {
        console.error("Failed to load instructions:", err);
        setMarkdownContent(
          "# Error\nCould not load installation instructions."
        );
      });
  }, [osType]);

  const handleNext = async () => {
    setIsSaving(true);
    try {
      await savePreferences(defaultPreferences);
      onNext();
    } catch (e) {
      console.error("Failed to save agreement preferences:", e);
      onNext();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OnboardingLayout
      title="Setup Guide"
      description="Please review the following instructions carefully."
      icon={
        <img
          src="/assets/emoji_u1f6e0.png"
          className={styles.iconImage}
          alt="Guide"
        />
      }
      onPrimaryAction={handleNext}
      disablePrimary={!isAgreed || isSaving}
      primaryLabel={isSaving ? "Initializing..." : "Next"}
      onSecondaryAction={onCancel}
      secondaryLabel="Cancel"
    >
      <div
        className="flex flex-col h-full space-y-3"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div className="text-sm text-gray-700 shrink-0">
          This guide contains critical information about permissions and
          troubleshooting.
        </div>

        <div className={styles.markdownScroll}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({ node, ...props }) => (
                <h1
                  style={{
                    fontSize: "1.5em",
                    fontWeight: "bold",
                    margin: "0.5em 0",
                  }}
                  {...props}
                />
              ),
              h2: ({ node, ...props }) => (
                <h2
                  style={{
                    fontSize: "1.25em",
                    fontWeight: "bold",
                    margin: "0.5em 0",
                  }}
                  {...props}
                />
              ),
              ul: ({ node, ...props }) => (
                <ul
                  style={{ listStyleType: "disc", paddingLeft: "1.5em" }}
                  {...props}
                />
              ),
              li: ({ node, ...props }) => (
                <li style={{ marginBottom: "0.25em" }} {...props} />
              ),
              p: ({ node, ...props }) => (
                <p style={{ marginBottom: "1em" }} {...props} />
              ),
            }}
          >
            {markdownContent}
          </ReactMarkdown>
        </div>

        <div className={styles.radioGroup}>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="agreement"
              className={styles.radioInput}
              checked={isAgreed}
              onChange={() => setIsAgreed(true)}
            />
            <span>I have read and understand the instructions</span>
          </label>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="agreement"
              className={styles.radioInput}
              checked={!isAgreed}
              onChange={() => setIsAgreed(false)}
            />
            <span>I do not understand</span>
          </label>
        </div>
      </div>
    </OnboardingLayout>
  );
};
