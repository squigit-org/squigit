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
  localModel: string;
  currentModel: string;
  setLocalModel: (model: string) => void;
}

const modelsWithInfo = [
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-pro")!,
    description: "Strongest - Complex reasoning",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-flash")!,
    description: "Balanced - Fast & versatile",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest")!,
    description: "Fastest - Quick tasks",
  },
];

export const PersonalContextSection: React.FC<PersonalContextSectionProps> = ({
  localPrompt,
  setLocalPrompt,
  onSavePersonalContext,
  localModel,
  currentModel,
  setLocalModel,
}) => {
  const foundIndex = modelsWithInfo.findIndex((m) => m.id === localModel);
  const currentModelIndex = foundIndex !== -1 ? foundIndex : 1;
  const selectedModel = modelsWithInfo[currentModelIndex] || modelsWithInfo[0];

  const handleNextModel = () => {
    const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
    const newModel = modelsWithInfo[nextIndex].id as ModelType;
    setLocalModel(newModel);
  };

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

      <div className={styles.section}>
        <label className={styles.label}>Models</label>
        <p className={styles.description}>
          Choose your preferred AI and OCR models for new conversations.
        </p>
        <div className={styles.modelSelector}>
          <div className={styles.modelInfo}>
            <span className={styles.modelName}>{selectedModel?.name}</span>
            <span className={styles.modelDescription}>
              {selectedModel?.description}
            </span>
          </div>
          <button
            className={styles.nextModelBtn}
            onClick={handleNextModel}
            title="Next model"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className={`${styles.modelSelector} ${styles.ocrModelSelector}`}>
          <div className={styles.modelInfo}>
            <span className={styles.modelName}>PP-OCRv4 (English)</span>
            <span className={styles.modelDescription}>
              High accuracy on-device OCR
            </span>
          </div>
          <button
            className={`${styles.nextModelBtn} ${styles.disabledBtn}`}
            title="Download model (Coming soon)"
          >
            <Download size={20} />
          </button>
        </div>
        {localModel !== currentModel && (
          <div className={styles.saveBtnContainer}>
            <button className={styles.keyBtn} onClick={onSavePersonalContext}>
              Apply Model Change
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
