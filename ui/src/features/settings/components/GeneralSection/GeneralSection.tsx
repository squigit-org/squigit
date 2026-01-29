import React, { useState, useEffect } from "react";
import styles from "./GeneralSection.module.css";
// Import the new component (adjust path as needed)
import { CapturePreview } from "./CapturePreview";

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
  const [localCaptureType, setLocalCaptureType] = useState(captureType);

  useEffect(() => {
    setLocalCaptureType(captureType);
  }, [captureType]);

  return (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>General</h2>
      </div>

      {/* --- SECTION 1: GLOBAL TOGGLES --- */}
      <div className={styles.section}>
        <div className={styles.controlRow}>
          <div>
            <span className={styles.label}>Dark Mode</span>
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

        <div className={styles.divider} />

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
        <div className={styles.divider} />

        <div className={styles.controlRow}>
          <div>
            <span className={`${styles.label} ${styles.imgOcrLabel}`}>
              Auto-extend Content
            </span>
            <span className={styles.description}>
              Automatically expand image on finish
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
        <div className={styles.divider} />

        <div className={styles.controlRow}>
          <div>
            <span className={`${styles.label} ${styles.imgOcrLabel}`}>
              Circle to search
            </span>
            <span className={styles.description}>
              {localCaptureType === "squiggle"
                ? "Turn off for standard box capture"
                : "Turn on for free-form capture"}
            </span>
          </div>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={localCaptureType === "squiggle"}
              onChange={(e) => {
                const newType = e.target.checked ? "squiggle" : "rectangular";
                setLocalCaptureType(newType);
                onCaptureTypeChange(newType);
              }}
            />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>

        <div className={styles.captureGrid}>
          {/* Right Column: React Component instead of Iframe */}
          <div className={styles.iframeWrapper}>
            <CapturePreview type={localCaptureType} />
          </div>
        </div>
      </div>
    </>
  );
};
