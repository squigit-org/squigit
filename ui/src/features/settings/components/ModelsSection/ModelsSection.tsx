/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from "react";
import { Download, Check } from "lucide-react";
import { ModelType } from "@/lib/config/models";
import { modelsWithInfo, ocrModels } from "@/features/settings";
import { WheelPicker, WheelPickerWrapper } from "@/widgets";
import styles from "./ModelsSection.module.css";

interface ModelsSectionProps {
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

  React.useEffect(() => {
    setIsDownloaded(initialDownloaded);
    setIsDownloading(false);
  }, [initialDownloaded]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading || isDownloaded) return;

    setIsDownloading(true);

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
}) => {
  const currentIndex = items.findIndex(
    (item) => item.id === currentValue || item.name === currentValue,
  );
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentItem = items[safeIndex];

  const options = items.map((item) => ({
    label: item.name,
    value: item.id || item.name,
  }));

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [shouldHideDescription, setShouldHideDescription] = useState(false);

  React.useEffect(() => {
    const checkVisibility = () => {
      if (containerRef.current) {
        const reelContainerWidth = containerRef.current.offsetWidth;
        setShouldHideDescription(reelContainerWidth < 600);
      }
    };

    checkVisibility();

    window.addEventListener("resize", checkVisibility);

    const observer = new ResizeObserver(checkVisibility);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", checkVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${styles.reelContainer} ${shouldHideDescription ? styles.centered : ""}`}
    >
      <div className={styles.wheelWrapper}>
        <WheelPickerWrapper className={styles.wheelPickerWrapper}>
          <WheelPicker
            options={options}
            value={currentValue}
            onValueChange={onValueChange}
            visibleCount={12}
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

      <div
        className={`${styles.descriptionPanel} ${shouldHideDescription ? styles.hidden : ""}`}
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
        </div>

        <ModelReel
          items={modelsWithInfo}
          currentValue={localModel}
          onValueChange={handleModelChange}
        />

        <ModelReel
          items={ocrModels}
          currentValue={ocrValue}
          onValueChange={handleOcrChange}
          showDownloadButton
        />
      </div>
    </div>
  );
};
