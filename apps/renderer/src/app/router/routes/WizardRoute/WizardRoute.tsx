/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { SettingsSection } from "@/features/settings";
import { useAppContext } from "../../../providers/AppProvider";
import { AuthStep } from "./steps/AuthStep/AuthStep";
import { APIKeyStep } from "./steps/APIKeyStep/APIKeyStep";
import { SetupStep } from "./steps/SetupStep/SetupStep";
import { PreferencesStep } from "./steps/PreferencesStep/PreferencesStep";
import { LicenseStep } from "./steps/LicenseStep/LicenseStep";
import { FlowButton } from "./components/FlowButton/FlowButton";
import styles from "./WizardRoute.module.css";

interface WizardRouteProps {
  onSystemAction: (actionId: string, value?: string) => void | Promise<void>;
  onOpenSettings: (section: SettingsSection) => void;
}

export const WizardRoute: React.FC<WizardRouteProps> = ({
  onSystemAction,
  onOpenSettings,
}) => {
  const app = useAppContext();
  const [customAction, setCustomAction] = useState<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
  } | null>(null);

  const [currentStep, setCurrentStep] = useState(
    () => app.system.wizardState?.step ?? 0,
  );

  useEffect(() => {
    if (!app.system.activeProfile) {
      setCurrentStep(0);
    }
  }, [app.system.activeProfile]);

  const steps = ["Auth", "APIKey", "Setup", "Preferences", "License"];
  const isAuthDone = !!app.system.activeProfile;
  const isApiKeyDone = !!app.system.apiKey;
  const isLicenseDone =
    app.system.wizardState?.data?.["step_4"]?.agreed === true;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      app.system.setWizardState({
        ...app.system.wizardState,
        step: newStep,
        isFinished: false,
      });
    } else {
      app.system.setAgreementCompleted();
      app.handleNewSession();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);
      app.system.setWizardState({
        ...app.system.wizardState,
        step: newStep,
        isFinished: false,
      });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.inner}>
          {currentStep === 0 && <AuthStep setCustomAction={setCustomAction} />}
          {currentStep === 1 && <APIKeyStep />}
          {currentStep === 2 && <SetupStep />}
          {currentStep === 3 && <PreferencesStep />}
          {currentStep === 4 && (
            <LicenseStep
              onSystemAction={onSystemAction}
              onOpenSettings={onOpenSettings}
            />
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
            variant={isAuthDone ? "next" : "cancel"}
            disabled={
              customAction?.disabled ||
              (!customAction && currentStep === 0 && !isAuthDone) ||
              (!customAction && currentStep === 1 && !isApiKeyDone) ||
              (currentStep === steps.length - 1 && !isLicenseDone)
            }
            onClick={customAction ? customAction.onClick : handleNext}
          >
            {customAction
              ? customAction.label
              : currentStep === steps.length - 1
                ? "Finish"
                : "Next"}
          </FlowButton>
        </div>
      </div>
    </div>
  );
};
