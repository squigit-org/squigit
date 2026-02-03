/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import styles from "./PersonalContextSection.module.css";
import { TextContextMenu } from "@/widgets";
import { useTextEditor } from "@/hooks/useTextEditor";
import { useTextContextMenu } from "@/widgets/menu/hooks/useTextContextMenu";

import { UserPreferences } from "@/lib/config/preferences";

interface PersonalContextSectionProps {
  localPrompt: string;
  currentPrompt: string;
  setLocalPrompt: (prompt: string) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

export const PersonalContextSection: React.FC<PersonalContextSectionProps> = ({
  localPrompt,
  currentPrompt,
  setLocalPrompt,
  updatePreferences,
}) => {
  React.useEffect(() => {
    // Avoid saving if values are identical (e.g. on mount or after save)
    if (localPrompt === currentPrompt) return;

    const handler = setTimeout(() => {
      updatePreferences({ prompt: localPrompt });
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [localPrompt, currentPrompt, updatePreferences]);

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

  return (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Personal Context</h2>
      </div>

      <div className={styles.section}>
        <div className={styles.controlsRow}>
          <p className={styles.description}>System Prompt</p>
        </div>

        <div className={styles.textareaWrapper}>
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            className={styles.textarea}
            placeholder="e.g., I prefer concise answers. I'm a software developer working mainly with React and TypeScript..."
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown as any}
          />
        </div>
        <p className={styles.noteText}>
          ➤ Add context about yourself, your preferences, or specific
          instructions for the AI.
        </p>
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
    </>
  );
};
