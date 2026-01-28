/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from "react";
import { HardDrive, Download, Check } from "lucide-react";
import { ModelType } from "../../../../lib/config/models";
import styles from "./ModelsSection.module.css";
import { modelsWithInfo, ocrModels } from "../../types/settings.types";
import {
  WheelPicker,
  WheelPickerWrapper,
} from "../../../../components/ncdai/wheel-picker";

interface ModelsSectionProps {
  onSavePersonalContext: () => void;
  localModel: string;
  currentModel: string;
  setLocalModel: (model: string) => void;
}

interface ModelReelProps {
  items: {
    id?: string;
    name: string;
    description: string;
    isDownloaded?: boolean;
  }[];
  currentValue: string;
  onValueChange: (value: string) => void;
  showDownloadButton?: boolean;
}

const ModelReel: React.FC<ModelReelProps> = ({
  items,
  currentValue,
  onValueChange,
  showDownloadButton = false,
}) => {
  const currentIndex = items.findIndex(
    (item) => item.id === currentValue || item.name === currentValue,
  );
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentItem = items[safeIndex];

  // Convert items to wheel picker options
  const options = items.map((item) => ({
    label: item.name,
    value: item.id || item.name,
  }));

  return (
    <div className={styles.reelContainer}>
      {/* Wheel Picker */}
      <div className={styles.wheelWrapper}>
        <WheelPickerWrapper className={styles.wheelPickerWrapper}>
          <WheelPicker
            options={options}
            value={currentValue}
            // @ts-ignore - The value type is string, which is compatible
            onValueChange={onValueChange}
            optionItemHeight={36}
            infinite
            classNames={{
              optionItem: styles.optionItem,
              highlightItem: styles.highlightItem,
              highlightWrapper: styles.highlightWrapper,
            }}
          />
        </WheelPickerWrapper>
      </div>

      {/* Description Panel */}
      <div className={styles.descriptionPanel}>
        <span className={styles.descriptionText}>
          {currentItem.description}
        </span>
        {showDownloadButton &&
          (currentItem.isDownloaded ? (
            <div className={styles.downloadedBadge} title="Downloaded">
              <Check size={16} />
            </div>
          ) : (
            <button
              className={styles.downloadBtn}
              title="Download model (Coming soon)"
            >
              <Download size={16} />
            </button>
          ))}
      </div>
    </div>
  );
};

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  onSavePersonalContext,
  localModel,
  currentModel,
  setLocalModel,
}) => {
  const [ocrValue, setOcrValue] = useState(ocrModels[0].name);

  const handleModelChange = useCallback(
    (value: string) => {
      setLocalModel(value as ModelType);
    },
    [setLocalModel],
  );

  const handleOcrChange = useCallback((value: string) => {
    setOcrValue(value);
  }, []);

  const hasChanges = localModel !== currentModel;

  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <HardDrive size={22} className={styles.sectionIcon} />
        <h2 className={styles.sectionTitle}>Models</h2>
      </div>

      <div className={styles.section}>
        <p className={styles.description}>
          Choose your preferred AI and OCR models for new conversations.
        </p>

        {/* AI Model Reel */}
        <ModelReel
          items={modelsWithInfo}
          currentValue={localModel}
          onValueChange={handleModelChange}
        />

        {/* OCR Model Reel */}
        <ModelReel
          items={ocrModels}
          currentValue={ocrValue}
          onValueChange={handleOcrChange}
          showDownloadButton
        />

        <div className={styles.saveBtnContainer}>
          <button
            className={`${styles.keyBtn} ${!hasChanges ? styles.keyBtnDisabled : ""}`}
            onClick={onSavePersonalContext}
            disabled={!hasChanges}
          >
            Apply Model Change
          </button>
        </div>
      </div>
    </div>
  );
};
