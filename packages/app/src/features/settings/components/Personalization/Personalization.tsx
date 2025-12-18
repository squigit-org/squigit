/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./Personalization.module.css";

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

interface PersonalContextProps {
  isActive: boolean;
  localPrompt: string;
  setLocalPrompt: (prompt: string) => void;
  selectedModel: ModelInfo;
  onNextModel: () => void;
  onBack: () => void;
  onReset: () => void;
  onSave: () => void;
  isRotating: boolean;
}

export const PersonalContext: React.FC<PersonalContextProps> = ({
  isActive,
  localPrompt,
  setLocalPrompt,
  selectedModel,
  onNextModel,
  onBack,
  onReset,
  onSave,
  isRotating,
}) => {
  return (
    <div
      className={`${styles["subview"]} ${isActive ? styles["active"] : ""}`}
      id="promptView"
    >
      <div className={styles["subview-header"]}>
        <button
          className={styles["back-btn"]}
          id="backPromptBtn"
          onClick={onBack}
        >
          <i className="fas fa-chevron-left" />
        </button>
        <button
          className={styles["reset-btn"]}
          id="resetPromptBtn"
          onClick={onReset}
        >
          Reset{" "}
          <i
            className={`fas fa-sync-alt ${
              isRotating ? styles["rotating"] : ""
            }`}
          />
        </button>
      </div>
      <div className={styles["subview-content"]}>
        <label htmlFor="promptTextarea">Customize Prompt 💬</label>
        <div className={styles["prompt-container"]}>
          <textarea
            className={styles["prompt-textarea"]}
            id="promptTextarea"
            placeholder="Write a prompt..."
            value={localPrompt}
            onChange={(e) => {
              setLocalPrompt(e.target.value);
            }}
          />{" "}
        </div>

        <div className={styles["form-group"]}>
          <label>Default Model 🧠</label>
          <div className={styles["model-switcher"]}>
            <div className={styles["model-info"]}>
              <span className={styles["model-name"]}>
                {selectedModel?.name}
              </span>
              <span className={styles["model-description"]}>
                {selectedModel?.description}
              </span>
            </div>
            <button className={styles["next-model-btn"]} onClick={onNextModel}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>

        <button className={styles["save-btn"]} id="saveBtn" onClick={onSave}>
          <i className="fas fa-save" /> Save
        </button>
      </div>
    </div>
  );
};
