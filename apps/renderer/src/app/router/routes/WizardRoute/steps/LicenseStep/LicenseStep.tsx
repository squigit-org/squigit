import React, { useMemo, useState } from "react";
import { useAppContext } from "@/app/providers/AppProvider";
import { usePlatform } from "@/hooks/shared";
import { ChatBubble } from "@/features/chat";
import {
  linuxInstruction as linux,
  macosInstruction as macos,
  windowsInstruction as windows,
} from "@/assets";
import type { Message } from "@squigit/core/brain/engine";
import { SettingsSection } from "@/features/settings";
import styles from "./LicenseStep.module.css";

const INSTRUCTIONS: Record<string, string> = {
  linux,
  macos,
  windows,
};

const SETTINGS_LINKS: Array<{ label: string; section: SettingsSection }> = [
  { label: "Settings -> Models", section: "models" },
  { label: "Settings -> API Keys", section: "apikeys" },
  { label: "Settings -> Personalization", section: "personalization" },
  { label: "Settings -> Help & Support", section: "help" },
  { label: "Settings -> General", section: "general" },
];

const linkifySettingsMentions = (raw: string): string => {
  let next = raw;
  for (const item of SETTINGS_LINKS) {
    const escaped = item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "g");
    next = next.replace(regex, `[${item.label}](#settings-${item.section})`);
  }
  return next;
};

interface LicenseStepProps {
  onSystemAction: (actionId: string, value?: string) => void | Promise<void>;
  onOpenSettings: (section: SettingsSection) => void;
}

export const LicenseStep: React.FC<LicenseStepProps> = ({
  onSystemAction,
  onOpenSettings,
}) => {
  const app = useAppContext();
  const { isMac, isWin } = usePlatform();

  const initialSelection = app.system.wizardState?.data?.["step_1"]?.agreed
    ? "agree"
    : "disagree";
  const [selected, setSelected] = useState(initialSelection);

  // When selection changes, we enable/disable the Next button by updating WizardState data
  const handleSelection = (value: string) => {
    setSelected(value);

    // Save to WizardState data object
    const currentData = app.system.wizardState?.data || {};
    app.system.setWizardState({
      step: 4,
      isFinished: false,
      data: {
        ...currentData,
        step_4: { agreed: value === "agree" },
      },
    });

    void onSystemAction(value, value);
  };

  const content = useMemo(() => {
    const raw = isMac
      ? INSTRUCTIONS.macos
      : isWin
        ? INSTRUCTIONS.windows
        : INSTRUCTIONS.linux;
    return linkifySettingsMentions(raw);
  }, [isMac, isWin]);

  const message: Message = {
    id: "welcome-intro",
    role: "system",
    text: content,
    timestamp: Date.now(),
  };

  const handleAgreementAction = (actionId: string, value?: string) => {
    if (actionId === "open_settings" && value) {
      onOpenSettings(value as SettingsSection);
    } else {
      void onSystemAction(actionId, value);
    }
  };

  // We rely on the WizardRoute to evaluate if this step is complete.
  // WizardRoute checks `isSetupDone = app.system.wizardState?.data?.["step_1"]?.agreed === true`

  return (
    <>
      <ChatBubble message={message} onAction={handleAgreementAction} />
      <div className={styles.authAction}>
        <div className={styles.actions}>
          <label
            className={`${styles.radioAction} ${
              selected === "disagree" ? styles.radioSelected : ""
            }`}
            onClick={() => handleSelection("disagree")}
          >
            <input
              type="radio"
              className={styles.radioInput}
              name="agreement"
              value="disagree"
              checked={selected === "disagree"}
              readOnly
            />
            I do not agree.
          </label>
          <label
            className={`${styles.radioAction} ${
              selected === "agree" ? styles.radioSelected : ""
            }`}
            onClick={() => handleSelection("agree")}
          >
            <input
              type="radio"
              className={styles.radioInput}
              name="agreement"
              value="agree"
              checked={selected === "agree"}
              readOnly
            />
            I agree. Let&apos;s go.
          </label>
        </div>
        <div className={styles.licenseText}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
          You can withdraw consent at any time.
        </div>
      </div>
    </>
  );
};
