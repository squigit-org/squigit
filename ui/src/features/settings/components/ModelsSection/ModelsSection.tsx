/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from "react";
import { Download, Check } from "lucide-react";
import { ModelType } from "../../../../lib/config/models";
import { modelsWithInfo, ocrModels } from "../../types/settings.types";
import { WheelPicker, WheelPickerWrapper } from "../../../../components";
import styles from "./ModelsSection.module.css";

interface ModelsSectionProps {
  onSavePersonalContext: () => void;
  localModel: string;
  currentModel: string;
  setLocalModel: (model: string) => void;
  isChatPanelOpen: boolean;
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
  isChatPanelOpen: boolean;
}

interface DownloadButtonProps {
  isDownloaded?: boolean;
  className?: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  isDownloaded: initialDownloaded,
  className,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(initialDownloaded);

  // Update local state if prop changes (e.g. switching models)
  React.useEffect(() => {
    setIsDownloaded(initialDownloaded);
    setIsDownloading(false);
  }, [initialDownloaded]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading || isDownloaded) return;

    setIsDownloading(true);

    // Mock download time
    setTimeout(() => {
      setIsDownloading(false);
      setIsDownloaded(true);
    }, 3000);
  };

  return (
    <button
      className={className}
      onClick={handleDownload}
      title={isDownloaded ? "Downloaded" : "Download model"}
      disabled={isDownloaded || isDownloading}
    >
      {isDownloading && (
        <svg className={styles.progressSvg} viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="16" className={styles.progressCircle} />
        </svg>
      )}
      {isDownloaded ? <Check size={16} /> : <Download size={16} />}
    </button>
  );
};

const ModelReel: React.FC<ModelReelProps> = ({
  items,
  currentValue,
  onValueChange,
  showDownloadButton = false,
  isChatPanelOpen,
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
    <div
      className={`${styles.reelContainer} ${isChatPanelOpen ? styles.centered : ""}`}
    >
      {/* Wheel Picker */}
      <div className={styles.wheelWrapper}>
        <WheelPickerWrapper className={styles.wheelPickerWrapper}>
          <WheelPicker
            options={options}
            value={currentValue}
            // @ts-ignore - The value type is string, which is compatible
            onValueChange={onValueChange}
            // KEY FIX 1: Count must be divisible by 4.
            // 12 is the sweet spot (low repetition, valid math).
            visibleCount={12}
            // KEY FIX 2: Increase height to compensate for the lower count.
            // This keeps the radius large (~100px) so it feels "flat" and stable.
            optionItemHeight={35}
            infinite
            classNames={{
              optionItem: styles.optionItem,
              highlightItem: styles.highlightItem,
              highlightWrapper: styles.highlightWrapper,
            }}
          />
        </WheelPickerWrapper>
      </div>

      {/* Description Panel - Always render for animation, but hide via class */}
      <div
        className={`${styles.descriptionPanel} ${isChatPanelOpen ? styles.hidden : ""}`}
      >
        <span className={styles.descriptionText}>
          {currentItem.description}
        </span>
        {showDownloadButton && (
          <DownloadButton
            key={currentItem.id || currentItem.name}
            isDownloaded={!!currentItem.isDownloaded}
            className={styles.downloadBtn}
          />
        )}
      </div>
    </div>
  );
};

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  onSavePersonalContext,
  localModel,
  currentModel,
  setLocalModel,
  isChatPanelOpen,
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
    <div>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Models</h2>
      </div>

      <div className={styles.section}>
        <div className={styles.controlsRow}>
          <p className={styles.description}>
            Choose your preferred AI and OCR models for new conversations.
          </p>

          <button
            className={`${styles.keyBtn} ${!hasChanges ? styles.keyBtnDisabled : ""}`}
            onClick={onSavePersonalContext}
            disabled={!hasChanges}
          >
            Apply Changes
          </button>
        </div>

        {/* AI Model Reel */}
        <ModelReel
          items={modelsWithInfo}
          currentValue={localModel}
          onValueChange={handleModelChange}
          isChatPanelOpen={isChatPanelOpen}
        />

        {/* OCR Model Reel */}
        <ModelReel
          items={ocrModels}
          currentValue={ocrValue}
          onValueChange={handleOcrChange}
          showDownloadButton
          isChatPanelOpen={isChatPanelOpen}
        />
      </div>
    </div>
  );
};
