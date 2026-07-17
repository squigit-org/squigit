import React, { useState } from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { commands } from "@/platform";
import { github } from "@squigit/core/services/github";
import { SettingsSection } from "@/features/settings";
import styles from "./LicenseStep.module.css";

interface LicenseStepProps {
  onSystemAction: (actionId: string, value?: string) => void | Promise<void>;
  onOpenSettings: (section: SettingsSection) => void;
}

export const LicenseStep: React.FC<LicenseStepProps> = () => {
  const app = useAppContext();
  const currentData = app.system.wizardState?.data?.["step_4"] || {};

  const [termsAgreed, setTermsAgreed] = useState(!!currentData.termsAgreed);
  const [reverseImageAgreed, setReverseImageAgreed] = useState(
    !!currentData.reverseImageAgreed,
  );
  const [updatesAgreed, setUpdatesAgreed] = useState(
    !!currentData.updatesAgreed,
  );

  const updateState = (
    terms: boolean,
    reverseImage: boolean,
    updates: boolean,
  ) => {
    const newData = {
      ...app.system.wizardState?.data,
      step_4: {
        termsAgreed: terms,
        reverseImageAgreed: reverseImage,
        updatesAgreed: updates,
      },
    };

    app.system.setWizardState({
      ...app.system.wizardState,
      step: 4,
      isFinished: false,
      data: newData,
    });
  };

  const handleTermsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setTermsAgreed(val);
    updateState(val, reverseImageAgreed, updatesAgreed);
  };

  const handleReverseImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setReverseImageAgreed(val);
    updateState(termsAgreed, val, updatesAgreed);
  };

  const handleUpdatesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setUpdatesAgreed(val);
    updateState(termsAgreed, reverseImageAgreed, val);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Security Notice & Data Use</h2>
      </div>

      <div className={styles.contentWrapper}>
        <p className={styles.topText}>
          Squigit is designed to work locally first. Your captures, threads, API
          keys, and settings stay on your device unless you explicitly use a
          feature that requires an external provider. When AI features are
          enabled, only the specific capture and prompt required to complete
          your request are sent to your configured provider. Squigit does not
          maintain a cloud copy of your conversations or personal data.
        </p>

        <div className={styles.checkboxGroup}>
          <div className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={termsAgreed}
              onChange={handleTermsChange}
            />
            <span className={styles.checkboxText}>
              I agree to the{" "}
              <a
                href="https://squigit-org.github.io/legal/terms.html"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Squigit Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="https://squigit-org.github.io/legal/privacy.html"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Privacy Policy
              </a>
              . I understand that AI providers may process captures and prompts
              that I explicitly send to them. I can change these settings at any
              time.
            </span>
          </div>

          <div className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={reverseImageAgreed}
              onChange={handleReverseImageChange}
            />
            <span className={styles.checkboxText}>
              I understand that the 'Reverse Image Search' feature uses a
              temporary image host. I agree to avoid using this specific feature
              on captures containing sensitive personal data.
            </span>
          </div>

          <div className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={updatesAgreed}
              onChange={handleUpdatesChange}
            />
            <span className={styles.checkboxText}>
              I'd like to receive product updates, release notes, and occasional
              announcements.
            </span>
          </div>
        </div>
      </div>
      <div className={styles.aboutSection}>
        <div className={styles.legalRow}>
          <span>Squigit © 2026</span>
          <span className={styles.dot}>•</span>
          <span>
            <button
              className={styles.legalLink}
              onClick={() => commands.openExternalUrl(github.license)}
            >
              Licensed under Apache 2.0
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};
