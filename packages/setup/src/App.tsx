/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { WizardStep, InstallerState } from "./types";
import { DEFAULT_INSTALL_PATH } from "./constants";
import { Welcome } from "./components/steps/Welcome";
import { Destination } from "./components/steps/Destination";
import { Ready } from "./components/steps/Ready";
import { Installing } from "./components/steps/Installing";
import { Finish } from "./components/steps/Finish";
import { UpdatePrompt } from "./components/steps/UpdatePrompt";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [osType, setOsType] = useState("win32");

  const [state, setState] = useState<InstallerState>({
    step: WizardStep.WELCOME,
    installPath: DEFAULT_INSTALL_PATH,
    isAgreed: false,
    launchOnExit: true,
  });

  useEffect(() => {
    async function init() {
      try {
        const status = await invoke<{os: string, is_installed: boolean}>('get_system_status');
        setOsType(status.os);

        if (status.is_installed) {
            setState(prev => ({ ...prev, step: WizardStep.UPDATE_PROMPT }));
        } else {
            setState(prev => ({ ...prev, step: WizardStep.WELCOME }));
        }

        setIsReady(true);
        await invoke('show_wizard_window');
        
      } catch (error) {
        console.error("Setup initialization failed", error);
        setIsReady(true);
        await getCurrentWindow().show();
      }
    }

    init();
  }, []);

  const nextStep = () => {
    setState((prev) => {
      switch (prev.step) {
        case WizardStep.UPDATE_PROMPT:
          return { ...prev, step: WizardStep.INSTALLING };
        case WizardStep.WELCOME:
          return { ...prev, step: WizardStep.DESTINATION };
        case WizardStep.DESTINATION:
          return { ...prev, step: WizardStep.READY };
        case WizardStep.READY:
          return { ...prev, step: WizardStep.INSTALLING };
        default:
          return prev;
      }
    });
  };

  const prevStep = () => {
    setState((prev) => {
      switch (prev.step) {
        case WizardStep.DESTINATION:
          return { ...prev, step: WizardStep.WELCOME };
        case WizardStep.READY:
          return { ...prev, step: WizardStep.DESTINATION };
        default:
          return prev;
      }
    });
  };

  const handleInstallComplete = () => {
    setState((prev) => ({ ...prev, step: WizardStep.FINISHED }));
  };

  const handleFinish = async () => {
    setState({
      step: WizardStep.WELCOME,
      installPath: DEFAULT_INSTALL_PATH,
      isAgreed: false,
      launchOnExit: true,
    });
  };

  const handleCancel = async () => {
    if (
      confirm(
        "Setup is not complete. If you exit now, the program will not be installed.\n\nYou may run Setup again at another time to complete the installation.\n\nExit Setup?"
      )
    ) {
      await getCurrentWindow().close();
    }
  };

  if (!isReady) return null;

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {state.step === WizardStep.UPDATE_PROMPT && (
        <UpdatePrompt onInstall={nextStep} onCancel={handleCancel} />
      )}
      {state.step === WizardStep.WELCOME && (
        <Welcome
          osType={osType}
          isAgreed={state.isAgreed}
          setIsAgreed={(val) =>
            setState((prev) => ({ ...prev, isAgreed: val }))
          }
          onNext={nextStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.DESTINATION && (
        <Destination
          installPath={state.installPath}
          setInstallPath={(val) =>
            setState((prev) => ({ ...prev, installPath: val }))
          }
          onNext={nextStep}
          onBack={prevStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.READY && (
        <Ready
          installPath={state.installPath}
          onInstall={nextStep}
          onBack={prevStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.INSTALLING && (
        <Installing onComplete={handleInstallComplete} />
      )}
      {state.step === WizardStep.FINISHED && (
        <Finish
          launchOnExit={state.launchOnExit}
          setLaunchOnExit={(val) =>
            setState((prev) => ({ ...prev, launchOnExit: val }))
          }
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}
