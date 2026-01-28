/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Sparkles, ChevronRight, Download } from "lucide-react";
import { MODELS, ModelType } from "../../../../lib/config/models";
import styles from "./PersonalContextSection.module.css";

interface PersonalContextSectionProps {
  localPrompt: string;
  setLocalPrompt: (prompt: string) => void;
  onSavePersonalContext: () => void;
}

export const PersonalContextSection: React.FC<PersonalContextSectionProps> = ({
  localPrompt,
  setLocalPrompt,
  onSavePersonalContext,
}) => {
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <Sparkles size={22} className={styles.sectionIcon} />
        <h2 className={styles.sectionTitle}>Personal Context</h2>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Prompts</label>
        <p className={styles.description}>
          Add context about yourself, your preferences, or specific instructions
          for the AI.
        </p>
        <div className={styles.textareaWrapper}>
          <textarea
            className={styles.textarea}
            placeholder="e.g., I prefer concise answers. I'm a software developer working mainly with React and TypeScript..."
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
          />
        </div>
        <div className={styles.saveBtnContainer}>
          <button className={styles.keyBtn} onClick={onSavePersonalContext}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
