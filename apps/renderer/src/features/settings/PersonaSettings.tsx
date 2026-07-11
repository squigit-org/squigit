/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useTextEditor, useTextContextMenu } from "@/hooks/editor";
import { TextContextMenu } from "@/app/layout/menus/TextContextMenu";
import { platform } from "@/platform";
import { useIdentityConfig } from "@/hooks/system/useIdentityConfig";
import styles from "./IdentitySettings.module.css";

interface IdentitySettingsProps {
  isWizard?: boolean;
}

function appendRulesContent(current: string, content: string): string {
  if (!content) return current;
  if (!current) return content;
  if (current.endsWith("\n\n") || content.startsWith("\n")) {
    return `${current}${content}`;
  }
  if (current.endsWith("\n")) {
    return `${current}\n${content}`;
  }
  return `${current}\n\n${content}`;
}

export const IdentitySettings: React.FC<IdentitySettingsProps> = ({
  isWizard,
}) => {
  const { prompt, loading, updatePrompt } = useIdentityConfig();
  const [localPrompt, setLocalPrompt] = useState("");

  useEffect(() => {
    setLocalPrompt(prompt);
  }, [prompt]);

  useEffect(() => {
    if (localPrompt === prompt) return;
    const handler = setTimeout(() => {
      updatePrompt(localPrompt);
    }, 1000);
    return () => clearTimeout(handler);
  }, [localPrompt, prompt, updatePrompt]);

  const handleImportRulesMd = async () => {
    try {
      const selected = await platform.dialog.open({
        filters: [{ name: "Markdown", extensions: ["md"] }],
        defaultPath: "Documents",
      });
      if (!selected || Array.isArray(selected)) return;

      const content = await platform.fs.readTextFile(selected);
      const nextPrompt = appendRulesContent(localPrompt, content);
      setLocalPrompt(nextPrompt);
      await updatePrompt(nextPrompt);
    } catch (err) {
      console.error("[IdentitySettings] Failed to import rules.md:", err);
    }
  };

  const handleBlur = () => {
    if (localPrompt === prompt) return;
    void updatePrompt(localPrompt);
  };

  const {
    ref,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleKeyDown,
  } = useTextEditor({
    value: localPrompt,
    onChange: setLocalPrompt,
  });

  const {
    data: contextMenu,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu({
    hasSelection,
  });

  if (loading) {
    return <div className={styles.container}>Loading personalization settings...</div>;
  }

  return (
    <section
      className={`${styles.container} ${isWizard ? styles.wizardContainer : ""}`}
      aria-labelledby="personalization-heading"
    >
      {!isWizard && (
        <header className={styles.sectionHeader}>
          <h2 id="personalization-heading" className={styles.sectionTitle}>
            Personalization
          </h2>
        </header>
      )}
      <div className={styles.group}>
        {!isWizard && (
          <div className={styles.controlsRow}>
            <span className={styles.description}>
              Want Squigit to help the same way every time?
            </span>
          </div>
        )}
        <div
          className={`${styles.textareaWrapper} ${isWizard ? styles.wizardTextareaWrapper : ""}`}
        >
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            className={`${styles.textarea} ${isWizard ? styles.wizardTextarea : ""}`}
            placeholder="Add your custom instructions..."
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={handleBlur}
            onContextMenu={handleContextMenu}
            onKeyDown={(e) => {
              if (e.key === "Enter") return;
              handleKeyDown(e as any);
            }}
          />
        </div>
        <div className={styles.rulesMdRow}>
          <div
            className={styles.rulesMdPicker}
            onClick={handleImportRulesMd}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void handleImportRulesMd();
              }
            }}
          >
            <span className={styles.rulesMdIcon}>
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </span>
            <span className={styles.rulesMdLabel}>Import RULES.md</span>
          </div>
        </div>
      </div>
      {contextMenu.isOpen && (
        <TextContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          hasSelection={hasSelection}
        />
      )}
    </section>
  );
};
