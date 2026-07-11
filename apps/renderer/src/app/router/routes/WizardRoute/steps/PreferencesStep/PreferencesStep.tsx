/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import ThemePicker from "../../components/ThemePicker/ThemePicker";
import { useAppContext } from "@/app/providers/AppProvider";
import { commands } from "@/platform";
import { CapturePreview } from "@/app/router/routes/WizardRoute/components/CapturePreview/CapturePreview";
import { IdentitySettings } from "@/features/settings/IdentitySettings";
import { Tooltip } from "@/components/ui/tooltip/Tooltip";
import styles from "./PreferencesStep.module.css";

export const PreferencesStep = () => {
  const app = useAppContext();
  const [isOcrInstalled, setIsOcrInstalled] = useState<boolean | null>(null);
  const [showInfoTip, setShowInfoTip] = useState(false);
  const infoIconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const checkOcr = async () => {
      try {
        await commands.runSidecarVersion("squigit-ocr --version");
        setIsOcrInstalled(true);
      } catch {
        setIsOcrInstalled(false);
      }
    };
    checkOcr();
  }, []);

  // ── Theme state ──
  const savedTheme =
    app.system.wizardState?.data?.step_3?.theme ||
    app.system.themePreference ||
    "dark";

  // ── Capture type state ──
  const storedCaptureType =
    app.system.wizardState?.data?.step_3?.captureType ||
    app.system.captureType;
  const savedCaptureType =
    storedCaptureType === "squiggle" ? "squiggle" : "traditional";

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
    if (
      !app.system.wizardState?.data?.step_3 ||
      app.system.wizardState.data.step_3.captureType !== savedCaptureType
    ) {
      updateWizardStep3({
        theme: savedTheme as "dark" | "light",
        captureType: savedCaptureType as "traditional" | "squiggle",
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

  const handleThemeChange = (theme: "dark" | "light") => {
    app.system.updatePreferences({ theme });
    updateWizardStep3({ theme });
  };

  const handleCaptureTypeChange = (type: "traditional" | "squiggle") => {
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
                <CapturePreview
                  captureType={savedCaptureType as "traditional" | "squiggle"}
                  onChange={handleCaptureTypeChange}
                  direction="up"
                  align="right"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className={styles.rightColumn}>
          <div className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <h2 className={styles.sectionTitle}>Text Recognition</h2>
              {isOcrInstalled === false && (
                <div className={styles.warningMessage}>
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>squigit-ocr not installed</span>
                </div>
              )}
            </div>
            <div className={styles.optionsGroup}>
              <div
                className={`${styles.optionRow} ${isOcrInstalled === false ? styles.optionDisabled : ""}`}
              >
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
                    disabled={isOcrInstalled === false}
                    onChange={(e) => handleOcrToggle(e.target.checked)}
                    aria-checked={savedOcrEnabled}
                    aria-label="Image OCR"
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              <div className={styles.optionDivider} />

              <div
                className={`${styles.optionRow} ${isOcrInstalled === false || !savedOcrEnabled ? styles.optionDisabled : ""}`}
              >
                <div className={styles.optionMeta}>
                  <span className={styles.optionLabel}>
                    Auto-extend Content
                  </span>
                  <span className={styles.optionDescription}>
                    Automatically expand image on finish
                  </span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={savedAutoExpand}
                    disabled={isOcrInstalled === false || !savedOcrEnabled}
                    onChange={(e) => handleAutoExpandToggle(e.target.checked)}
                    aria-checked={savedAutoExpand}
                    aria-label="Auto-extend Content"
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>
          </div>

          <div className={styles.section} style={{ marginTop: "1rem" }}>
            <div className={styles.sectionTitleWithInfo}>
              <h2 className={styles.sectionTitle}>
                Tell Squigit how it can help
              </h2>
              <span
                ref={infoIconRef}
                className={styles.infoIcon}
                onMouseEnter={() => setShowInfoTip(true)}
                onMouseLeave={() => setShowInfoTip(false)}
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
              <Tooltip
                text={`Want Squigit to help the same way every time? This message is included with every squigit you make.\n\nTip: Import RULES.md to append reusable instructions into your RULES editor.`}
                parentRef={infoIconRef}
                show={showInfoTip}
                vertical
              />
            </div>
            <IdentitySettings isWizard={true} />
          </div>
        </div>
      </div>
    </div>
  );
};
