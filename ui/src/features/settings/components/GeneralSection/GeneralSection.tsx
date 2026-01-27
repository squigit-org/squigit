/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Settings, Image as ImageIcon } from "lucide-react";
import styles from "./GeneralSection.module.css";

interface GeneralSectionProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  autoExpandOCR: boolean;
  onToggleAutoExpand: (checked: boolean) => void;
  captureType: "rectangular" | "squiggle";
  onCaptureTypeChange: (type: "rectangular" | "squiggle") => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  onToggleAutoExpand,
  captureType,
  onCaptureTypeChange,
}) => {
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <Settings size={22} className={styles.sectionIcon} />
        <h2 className={styles.sectionTitle}>Preferences</h2>
      </div>

      <div className={styles.section}>
        <div className={styles.controlRow}>
          <div>
            <span className={styles.label}>App Theme</span>
            <span className={styles.description}>
              Toggle between dark and light mode
            </span>
          </div>
          <div className={styles.toggleSwitch}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={!isDarkMode}
              onChange={onToggleTheme}
            />
            <span className={styles.toggleSlider}></span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Image Processing</span>
        <div className={`${styles.controlRow} ${styles.imgOcrRow}`}>
          <div>
            <span className={`${styles.label} ${styles.imgOcrLabel}`}>
              Image OCR
            </span>
            <span className={styles.description}>
              Extract text from screenshots
            </span>
          </div>
          <div className={styles.toggleSwitch}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={true}
              disabled
            />
            <span className={styles.toggleSlider}></span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <div>
            <span className={`${styles.label} ${styles.imgOcrLabel}`}>
              Auto-extend Content
            </span>
            <span className={styles.description}>
              Automatically expand image analysis
            </span>
          </div>
          <div className={styles.toggleSwitch}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={autoExpandOCR}
              onChange={(e) => onToggleAutoExpand(e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </div>
        </div>
      </div>

      <div className={`${styles.sectionHeader} ${styles.prefCaptureHeader}`}>
        <ImageIcon size={22} className={styles.sectionIcon} />
        <h2 className={styles.sectionTitle}>Preferred Capture</h2>
      </div>

      <div className={styles.section}>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="capture"
              className={styles.radioInput}
              checked={captureType === "rectangular"}
              onChange={() => onCaptureTypeChange("rectangular")}
            />
            <span>Rectangular Selection</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="capture"
              className={styles.radioInput}
              checked={captureType === "squiggle"}
              onChange={() => onCaptureTypeChange("squiggle")}
            />
            <span>Free-form (Squiggle)</span>
          </label>
        </div>
      </div>
    </div>
  );
};
