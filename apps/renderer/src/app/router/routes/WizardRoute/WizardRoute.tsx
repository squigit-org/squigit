/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from "react";
import {
  linuxInstruction as linux,
  macosInstruction as macos,
  windowsInstruction as windows,
} from "@/assets";
import { ChatBubble } from "@/features/chat";
import { SettingsSection } from "@/features/settings";
import { usePlatform } from "@/hooks/shared";
import type { Message } from "@squigit/core/brain/engine";
import { useAppContext } from "../../../providers/AppProvider";
import { AuthStep } from "./steps/AuthStep/AuthStep";
import { FlowButton } from "./components/FlowButton/FlowButton";
import styles from "./WizardRoute.module.css";

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

interface WizardRouteProps {
  onSystemAction: (actionId: string, value?: string) => void | Promise<void>;
  onOpenSettings: (section: SettingsSection) => void;
}

export const WizardRoute: React.FC<WizardRouteProps> = ({
  onSystemAction,
  onOpenSettings,
}) => {
  const { isMac, isWin } = usePlatform();
  const app = useAppContext();
  const [selected, setSelected] = useState("disagree");
  
  const [currentStep, setCurrentStep] = useState(() => {
    const savedStep = app.system.wizardState?.step || 0;
    if (app.system.activeProfile && savedStep === 0) {
      return 1;
    }
    return savedStep;
  });

  useEffect(() => {
    if (app.system.activeProfile && app.system.wizardState?.step === 0) {
      app.system.setWizardState({ step: 1, isFinished: false });
    }
  }, [app.system.activeProfile, app.system.wizardState?.step]);

  const steps = ["Auth", "Setup"]; // Dummy second step for dots
  const isAuthDone = !!app.system.activeProfile;
  const isSetupDone = selected === "agree";

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

  const handleSelection = (value: string) => {
    setSelected(value);
    void onSystemAction(value, value);
  };

  const handleAgreementAction = (actionId: string, value?: string) => {
    if (actionId === "open_settings" && value) {
      onOpenSettings(value as SettingsSection);
      return;
    }
    void onSystemAction(actionId, value);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      app.system.setWizardState({ step: newStep, isFinished: false });
    } else {
      app.system.setWizardState({ step: currentStep, isFinished: true });
      app.system.setAgreementCompleted();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);
      app.system.setWizardState({ step: newStep, isFinished: false });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.inner}>
          {currentStep === 0 && <AuthStep onNext={handleNext} />}
          {currentStep === 1 && (
            <>
              <ChatBubble
                message={message}
                animate={true}
                onAction={handleAgreementAction}
              />
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
                  By agreeing, you accept the{" "}
                  <a
                    href="https://github.com/a7mddra/squigit/blob/main/LICENSE"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Apache-2.0 License
                  </a>
                  .
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {currentStep > 0 && (
            <FlowButton variant="back" onClick={handleBack} />
          )}
        </div>
        
        <div className={styles.footerCenter}>
          {steps.map((_, index) => (
            <div 
              key={index} 
              className={`${styles.stepDot} ${index === currentStep ? styles.stepDotActive : ""}`} 
            />
          ))}
        </div>

        <div className={styles.footerRight}>
          <FlowButton 
            variant="next" 
            disabled={(currentStep === 0 && !isAuthDone) || (currentStep === 1 && !isSetupDone)}
            onClick={handleNext} 
          >
            {currentStep === steps.length - 1 ? "Finish" : "Next"}
          </FlowButton>
        </div>
      </div>
    </div>
  );
};
