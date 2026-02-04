/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import styles from "./GeneralSection.module.css";
import { CapturePreview } from "./CapturePreview";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/widgets";

interface GeneralSectionProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  autoExpandOCR: boolean;
  onToggleAutoExpand: (checked: boolean) => void;
  ocrEnabled: boolean;
  onToggleOcrEnabled: (checked: boolean) => void;
  captureType: "rectangular" | "squiggle";
  onCaptureTypeChange: (type: "rectangular" | "squiggle") => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  onToggleAutoExpand,
  ocrEnabled,
  onToggleOcrEnabled,
  captureType,
  onCaptureTypeChange,
}) => {
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);

  return (
    <section className={styles.container} aria-labelledby="general-heading">
      <header className={styles.sectionHeader}>
        <h2 id="general-heading" className={styles.sectionTitle}>
          General
        </h2>
      </header>

      <div className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>Appearance</span>
            <span className={styles.description}>
              Customize the look and feel
            </span>
          </div>
          <div className={styles.rowControl}>
            <Dropdown
              label={
                isDarkMode === null ? "System" : isDarkMode ? "Dark" : "Light"
              }
              width={160}
              isOpen={appearanceMenuOpen}
              onOpenChange={setAppearanceMenuOpen}
            >
              <DropdownSectionTitle>Appearance</DropdownSectionTitle>
              <div className={styles.list}>
                <DropdownItem
                  label="Dark"
                  isActive={isDarkMode === true}
                  onClick={() => {
                    onToggleTheme;
                    setAppearanceMenuOpen(false);
                  }}
                />
                <DropdownItem
                  label="Light"
                  isActive={isDarkMode === false}
                  onClick={() => {
                    onToggleTheme;
                    setAppearanceMenuOpen(false);
                  }}
                />
                <DropdownItem
                  label="System"
                  isActive={isDarkMode === null}
                  onClick={() => {
                    setAppearanceMenuOpen(false);
                  }}
                />
              </div>
            </Dropdown>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>Capture type</span>
            <span className={styles.description}>
              Customize the way you capture
            </span>
          </div>
          <div className={styles.rowControl}>
            <Dropdown
              label={
                captureType === "squiggle" ? "Circle to search" : "Default"
              }
              width={220}
              isOpen={captureMenuOpen}
              onOpenChange={setCaptureMenuOpen}
            >
              <DropdownSectionTitle>Capture Type</DropdownSectionTitle>
              <div className={styles.previewContainer}>
                <div className={styles.dropdownPreviewWrapper}>
                  <CapturePreview type={captureType} />
                </div>
              </div>
              <div className={styles.list}>
                <DropdownItem
                  label="Default"
                  isActive={captureType === "rectangular"}
                  onClick={() => onCaptureTypeChange("rectangular")}
                />
                <DropdownItem
                  label="Circle to search"
                  isActive={captureType === "squiggle"}
                  onClick={() => onCaptureTypeChange("squiggle")}
                />
              </div>
            </Dropdown>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>Image OCR</span>
            <span className={styles.description}>
              Extract text from screenshots
            </span>
          </div>

          <div className={styles.rowControl}>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                className={styles.toggleInput}
                checked={ocrEnabled}
                onChange={(e) => onToggleOcrEnabled(e.target.checked)}
                aria-checked={ocrEnabled}
                aria-label="Image OCR"
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={`${styles.row} ${!ocrEnabled ? styles.disabled : ""}`}>
          <div className={styles.rowMeta}>
            <span className={styles.label}>Auto-extend Content</span>
            <span className={styles.description}>
              Automatically expand image on finish
            </span>
          </div>

          <div className={styles.rowControl}>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                className={styles.toggleInput}
                checked={autoExpandOCR}
                disabled={!ocrEnabled}
                onChange={(e) => onToggleAutoExpand(e.target.checked)}
                aria-checked={autoExpandOCR}
                aria-label="Auto-extend Content"
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};
