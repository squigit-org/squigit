/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import ThemePicker from "../../components/ThemePicker/ThemePicker";
import { useAppContext } from "@/app/providers/AppProvider";
import { CapturePreview } from "@/features/settings/components/CapturePreview";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/components/ui";
import styles from "./PreferencesStep.module.css";

export const PreferencesStep = () => {
  const app = useAppContext();
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);

  // ── Theme state ──
  const savedTheme =
    app.system.wizardState?.data?.step_3?.theme ||
    app.system.themePreference ||
    "dark";

  // ── Capture type state ──
  const savedCaptureType =
    app.system.wizardState?.data?.step_3?.captureType ||
    app.system.captureType ||
    "rectangular";

  // ── OCR state ──
  const savedOcrEnabled =
    app.system.wizardState?.data?.step_3?.ocrEnabled ??
    app.system.ocrEnabled ??
    true;
  const savedAutoExpand =
    app.system.wizardState?.data?.step_3?.autoExpandOCR ??
    app.system.autoExpandOCR ??
    true;

  // ── Persist defaults on mount ──
  useEffect(() => {
    if (!app.system.wizardState?.data?.step_3) {
      updateWizardStep3({
        theme: savedTheme as "dark" | "light",
        captureType: savedCaptureType as "rectangular" | "squiggle",
        ocrEnabled: savedOcrEnabled,
        autoExpandOCR: savedAutoExpand,
      });
    }
  }, []);

  // ── Helper to update step_3 data ──
  const updateWizardStep3 = (patch: Record<string, unknown>) => {
    const current = app.system.wizardState?.data?.step_3 || {};
    app.system.setWizardState({
      step: app.system.wizardState?.step ?? 3,
      isFinished: app.system.wizardState?.isFinished ?? false,
      data: {
        ...app.system.wizardState?.data,
        step_3: { ...current, ...patch },
      },
    });
  };

  // ── Handlers ──
  const handleThemeChange = (theme: "dark" | "light") => {
    app.system.updatePreferences({ theme });
    updateWizardStep3({ theme });
  };

  const handleCaptureTypeChange = (type: "rectangular" | "squiggle") => {
    app.system.updatePreferences({ captureType: type });
    updateWizardStep3({ captureType: type });
  };

  const handleOcrToggle = (checked: boolean) => {
    app.system.updatePreferences({ ocrEnabled: checked });
    updateWizardStep3({ ocrEnabled: checked });
  };

  const handleAutoExpandToggle = (checked: boolean) => {
    app.system.updatePreferences({ autoExpandOCR: checked });
    updateWizardStep3({ autoExpandOCR: checked });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Time to shape your Squigit</h1>
      </div>
      <div className={styles.columns}>
        {/* ── Left Column ── */}
        <div className={styles.leftColumn}>
          {/* Appearance */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Appearance</h2>
            <div className={styles.pickerContainer}>
              <ThemePicker
                value={savedTheme as "dark" | "light"}
                onChange={handleThemeChange}
              />
            </div>
          </div>

          {/* Capture Type (dropdown) */}
          <div className={styles.section}>
            <div className={styles.captureTypeContainer}>
              <div className={styles.captureTypeHeader}>
                <h2 className={styles.sectionTitle}>Capture type</h2>
                <p className={styles.sectionSubtitle}>
                  Customize the way you squiggle
                </p>
              </div>
              <div className={styles.captureDropdownRow}>
                <Dropdown
                  label={
                    savedCaptureType === "squiggle" ? "Circle to search" : "Default"
                  }
                  width={220}
                  isOpen={captureMenuOpen}
                  onOpenChange={setCaptureMenuOpen}
                  direction="up"
                  align="left"
                >
                  <DropdownSectionTitle>Capture Type</DropdownSectionTitle>
                  <div className={styles.previewContainer}>
                    <div className={styles.dropdownPreviewWrapper}>
                      <CapturePreview
                        type={savedCaptureType as "rectangular" | "squiggle"}
                      />
                    </div>
                  </div>
                  <div className={styles.list}>
                    <DropdownItem
                      label="Default"
                      isActive={savedCaptureType === "rectangular"}
                      onClick={() => handleCaptureTypeChange("rectangular")}
                    />
                    <DropdownItem
                      label="Circle to search"
                      isActive={savedCaptureType === "squiggle"}
                      onClick={() => handleCaptureTypeChange("squiggle")}
                    />
                  </div>
                </Dropdown>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className={styles.rightColumn}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Text Recognition</h2>
            <div className={styles.optionsGroup}>
              <div className={styles.optionRow}>
                <div className={styles.optionMeta}>
                  <span className={styles.optionLabel}>Image OCR</span>
                  <span className={styles.optionDescription}>
                    Extract text from screenshots
                  </span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={savedOcrEnabled}
                    onChange={(e) => handleOcrToggle(e.target.checked)}
                    aria-checked={savedOcrEnabled}
                    aria-label="Image OCR"
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              <div className={styles.optionDivider} />

              <div
                className={`${styles.optionRow} ${!savedOcrEnabled ? styles.optionDisabled : ""}`}
              >
                <div className={styles.optionMeta}>
                  <span className={styles.optionLabel}>Auto-extend Content</span>
                  <span className={styles.optionDescription}>
                    Automatically expand image on finish
                  </span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={savedAutoExpand}
                    disabled={!savedOcrEnabled}
                    onChange={(e) => handleAutoExpandToggle(e.target.checked)}
                    aria-checked={savedAutoExpand}
                    aria-label="Auto-extend Content"
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
