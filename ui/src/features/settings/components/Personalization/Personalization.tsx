/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { RotateCw, ChevronRight, Save, Sparkles } from "lucide-react";
import { MODELS, ModelType } from "../../../../lib/config/models";
import { DEFAULT_MODEL, DEFAULT_PROMPT } from "../../../../lib/utils/constants";
import styles from "./Personalization.module.css";

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

const modelsWithInfo: ModelInfo[] = [
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-pro")!,
    description: "Strongest",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-flash")!,
    description: "Good",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest")!,
    description: "Fastest",
  },
];

export interface PersonalizationHandle {
  isDirty: () => boolean;
  save: () => void;
}

interface PersonalizationProps {
  currentPrompt: string;
  currentModel: string;
  onSave: (prompt: string, model: string) => void;
}

export const Personalization = forwardRef<
  PersonalizationHandle,
  PersonalizationProps
>(({ currentPrompt, currentModel, onSave }, ref) => {
  const [localPrompt, setLocalPrompt] = useState(currentPrompt);
  const [localModel, setLocalModel] = useState(currentModel);
  const [isRotating, setIsRotating] = useState(false);

  useEffect(() => {
    setLocalPrompt(currentPrompt);
    setLocalModel(currentModel);
  }, [currentPrompt, currentModel]);

  const foundIndex = modelsWithInfo.findIndex((m) => m.id === localModel);
  const currentModelIndex = foundIndex !== -1 ? foundIndex : 1;
  const selectedModel = modelsWithInfo[currentModelIndex] || modelsWithInfo[0];

  const hasChanges =
    localPrompt !== currentPrompt || localModel !== currentModel;

  const handleNextModel = () => {
    const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
    setLocalModel(modelsWithInfo[nextIndex].id as ModelType);
  };

  const handleReset = async () => {
    setIsRotating(true);
    setLocalPrompt(DEFAULT_PROMPT);
    setLocalModel(DEFAULT_MODEL);
    setTimeout(() => setIsRotating(false), 500);
  };

  const handleSave = () => {
    onSave(localPrompt, localModel);
  };

  useImperativeHandle(ref, () => ({
    isDirty: () => hasChanges,
    save: handleSave,
  }));

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Sparkles size={24} className={styles.icon} />
            <h1 className={styles.title}>Personal Context</h1>
          </div>
          <p className={styles.subtitle}>
            Customize how the AI responds to you
          </p>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Custom Prompt</label>
          <p className={styles.description}>
            Add context about yourself, your preferences, or specific
            instructions for the AI.
          </p>
          <div className={styles.textareaWrapper}>
            <textarea
              className={styles.textarea}
              placeholder="e.g., I prefer concise answers. I'm a software developer working mainly with React and TypeScript..."
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Default Model</label>
          <p className={styles.description}>
            Choose your preferred AI model for new conversations.
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
        </div>

        <div className={styles.actions}>
          <button
            className={styles.resetBtn}
            onClick={handleReset}
            title="Reset to defaults"
          >
            <RotateCw size={16} className={isRotating ? styles.rotating : ""} />
            Reset
          </button>
          <button
            className={`${styles.saveBtn} ${!hasChanges ? styles.disabled : ""}`}
            onClick={handleSave}
            disabled={!hasChanges}
            title="Save changes"
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
});
