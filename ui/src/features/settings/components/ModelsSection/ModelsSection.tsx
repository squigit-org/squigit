/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Sparkles, ChevronRight, Download, Check } from "lucide-react";
import { ModelType } from "../../../../lib/config/models";
import styles from "./ModelsSection.module.css";
import { modelsWithInfo, ocrModels } from "../../types/settings.types";

interface ModelsSectionProps {
  onSavePersonalContext: () => void;
  localModel: string;
  currentModel: string;
  setLocalModel: (model: string) => void;
}

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  onSavePersonalContext,
  localModel,
  currentModel,
  setLocalModel,
}) => {
  const foundIndex = modelsWithInfo.findIndex((m) => m.id === localModel);
  const currentModelIndex = foundIndex !== -1 ? foundIndex : 1;
  const selectedModel = modelsWithInfo[currentModelIndex] || modelsWithInfo[0];

  const [ocrIndex, setOcrIndex] = useState(0);
  const selectedOCR = ocrModels[ocrIndex];

  const handleNextModel = () => {
    const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
    const newModel = modelsWithInfo[nextIndex].id as ModelType;
    setLocalModel(newModel);
  };

  const handleNextOCR = () => {
    setOcrIndex((prev) => (prev + 1) % ocrModels.length);
  };

  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <Sparkles size={22} className={styles.sectionIcon} />
        <h2 className={styles.sectionTitle}>Models</h2>
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
            <span className={styles.modelName}>{selectedOCR.name}</span>
            <span className={styles.modelDescription}>
              {selectedOCR.description}
            </span>
          </div>
          <div className={styles.actionButtons}>
            {!selectedOCR.isDownloaded && (
              <button
                className={styles.downloadBtn}
                title="Download model (Coming soon)"
              >
                <Download size={18} />
              </button>
            )}
            <button
              className={styles.nextModelBtn}
              onClick={handleNextOCR}
              title="Next OCR model"
            >
              <ChevronRight size={20} />
            </button>
          </div>
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
