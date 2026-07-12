/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import styles from "./GeneralSettings.module.css";
import { CapturePreview } from "@/app/router/routes/WizardRoute/components/CapturePreview/CapturePreview";
import {
  Dropdown,
  DropdownItem,
  DropdownSectionTitle,
  ToggleSwitch,
} from "@/components/ui";

interface GeneralSettingsProps {
  themePreference: "dark" | "light" | "system";
  onSetTheme: (theme: "dark" | "light" | "system") => void;
  autoExpandOCR: boolean;
  onToggleAutoExpand: (checked: boolean) => void;
  ocrEnabled: boolean;
  onToggleOcrEnabled: (checked: boolean) => void;
  captureType: "traditional" | "squiggle";
  onCaptureTypeChange: (type: "traditional" | "squiggle") => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  themePreference,
  onSetTheme,
  autoExpandOCR,
  onToggleAutoExpand,
  ocrEnabled,
  onToggleOcrEnabled,
  captureType,
  onCaptureTypeChange,
}) => {
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);

  const getThemeLabel = () => {
    switch (themePreference) {
      case "dark":
        return "Dark";
      case "light":
        return "Light";
      case "system":
        return "System";
      default:
        return "System";
    }
  };

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
              label={getThemeLabel()}
              width={160}
              isOpen={appearanceMenuOpen}
              onOpenChange={setAppearanceMenuOpen}
            >
              <DropdownSectionTitle>Appearance</DropdownSectionTitle>
              <div className={styles.list}>
                <DropdownItem
                  label="Dark"
                  isActive={themePreference === "dark"}
                  onClick={() => {
                    onSetTheme("dark");
                    setAppearanceMenuOpen(false);
                  }}
                />
                <DropdownItem
                  label="Light"
                  isActive={themePreference === "light"}
                  onClick={() => {
                    onSetTheme("light");
                    setAppearanceMenuOpen(false);
                  }}
                />
                <DropdownItem
                  label="System"
                  isActive={themePreference === "system"}
                  onClick={() => {
                    onSetTheme("system");
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
            <CapturePreview
              captureType={captureType}
              onChange={onCaptureTypeChange}
            />
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
            <ToggleSwitch
              checked={ocrEnabled}
              onChange={onToggleOcrEnabled}
              ariaLabel="Image OCR"
            />
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
            <ToggleSwitch
              checked={autoExpandOCR}
              disabled={!ocrEnabled}
              onChange={onToggleAutoExpand}
              ariaLabel="Auto-extend Content"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
