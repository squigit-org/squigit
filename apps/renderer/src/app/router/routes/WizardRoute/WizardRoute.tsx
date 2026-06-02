/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
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
  const [currentStep, setCurrentStep] = useState(0);

  const steps = ["Auth", "Setup"]; // Dummy second step for dots
  const isDone = !!app.system.activeProfile;

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

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.inner}>
          {currentStep === 0 && <AuthStep onNext={() => setCurrentStep(1)} />}
        </div>
      </div>
      
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {currentStep > 0 && (
            <FlowButton variant="back" onClick={() => setCurrentStep(curr => curr - 1)} />
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
            disabled={currentStep === 0 && !isDone}
            onClick={() => setCurrentStep(curr => curr + 1)} 
          />
        </div>
      </div>
    </div>
  );
};
