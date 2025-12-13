/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

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
    <div className={`subview ${isActive ? "active" : ""}`} id="promptView">
      <div className="subview-header">
        <button className="back-btn" id="backPromptBtn" onClick={onBack}>
          <i className="fas fa-arrow-left" />
        </button>
        <button className="reset-btn" id="resetPromptBtn" onClick={onReset}>
          Reset{" "}
          <i className={`fas fa-sync-alt ${isRotating ? "rotating" : ""}`} />
        </button>
      </div>
      <div className="subview-content">
        <label htmlFor="promptTextarea">Customize Prompt</label>
        <textarea
          className="prompt-textarea"
          id="promptTextarea"
          placeholder="Write a prompt..."
          value={localPrompt}
          onChange={(e) => {
            setLocalPrompt(e.target.value);
          }}
        />

        <div className="form-group">
          <label>Default Model</label>
          <div className="model-switcher">
            <div className="model-info">
              <span className="model-name">{selectedModel?.name}</span>
              <span className="model-description">
                {selectedModel?.description}
              </span>
            </div>
            <button className="next-model-btn" onClick={onNextModel}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>

        <button className="save-btn" id="saveBtn" onClick={onSave}>
          <i className="fas fa-save" /> Save
        </button>
      </div>
    </div>
  );
};
