/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, memo, forwardRef } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { createHighlighter, type Highlighter } from "shiki";
import styles from "./CodeBlock.module.css";

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighterInstance = async () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["dracula", "github-light"],
      langs: [],
    });
  }
  return highlighterPromise;
};

interface CodeBlockProps {
  language: string;
  value: string;
  isEditable?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}

const CodeBlockComponent = forwardRef<HTMLTextAreaElement, CodeBlockProps>(
  (
    { language, value, isEditable = false, onChange, onKeyDown, placeholder },
    ref
  ) => {
    const [isCopied, setIsCopied] = useState(false);
    const [highlightedCode, setHighlightedCode] = useState<string>("");
    const [isLoading, setIsLoading] = useState(
      !isEditable && language !== "text"
    );

    useEffect(() => {
      if (isEditable || language === "text") {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      let isMounted = true;

      const highlight = async () => {
        try {
          const highlighter = await getHighlighterInstance();

          if (
            language &&
            language !== "text" &&
            !highlighter.getLoadedLanguages().includes(language)
          ) {
            try {
              await highlighter.loadLanguage(language as any);
            } catch (e) {
              console.warn(`Failed to load language: ${language}`);
            }
          }

          const lang = highlighter.getLoadedLanguages().includes(language)
            ? language
            : "bash";

          const html = highlighter.codeToHtml(value, {
            lang,
            themes: {
              light: "github-light",
              dark: "dracula",
            },
            defaultColor: false,
          });

          if (isMounted) {
            setHighlightedCode(html);
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Shiki error:", error);
          if (isMounted) setIsLoading(false);
        }
      };

      highlight();

      return () => {
        isMounted = false;
      };
    }, [value, language, isEditable]);

    const handleCopy = () => {
      navigator.clipboard.writeText(value).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      });
    };

    if (isEditable) {
      return (
        <div className={styles.wrapper}>
          <div className={styles.header}>
            <div className={styles.langLabel}>
              <Terminal size={14} />
              <span className={styles.langName}>{language || "text"}</span>
            </div>
          </div>
          <textarea
            ref={ref}
            className={styles.textarea}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={5}
          />
        </div>
      );
    }

    return (
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <div className={styles.langLabel}>
            <Terminal size={14} />
            <span className={styles.langName}>{language || "text"}</span>
          </div>
          <button
            onClick={handleCopy}
            className={styles.copyButton}
            disabled={isCopied}
            title="Copy code"
          >
            {isCopied ? (
              <>
                <Check size={14} /> Copied
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
          </button>
        </div>

        <div className={styles.content}>
          {isLoading ? (
            <pre className={styles.pre}>{value}</pre>
          ) : language === "text" ? (
            <pre className={styles.pre}>{value}</pre>
          ) : (
            <div
              className={`${styles.shikiContainer} shiki-dual-theme`}
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          )}
        </div>
      </div>
    );
  }
);

CodeBlockComponent.displayName = "CodeBlock";

export const CodeBlock = memo(CodeBlockComponent);
