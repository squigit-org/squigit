/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { WizardStep, InstallerState, SystemStatus } from "./types";
import { OS_CONFIG } from "./constants";
import { Welcome } from "./components/steps/Welcome";
import { Destination } from "./components/steps/Destination";
import { Ready } from "./components/steps/Ready";
import { Installing } from "./components/steps/Installing";
import { Finish } from "./components/steps/Finish";
import { Update } from "./components/steps/Update";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [osType, setOsType] = useState("linux");

  const [state, setState] = useState<InstallerState>({
    step: WizardStep.WELCOME,
    installPath: "",
    isAgreed: false,
    launchOnExit: true,
    arch: "x64",
  });

  useEffect(() => {
    async function init() {
      try {
        const status = await invoke<SystemStatus>("get_system_status");
        
        setOsType(status.os);
        const config = OS_CONFIG[status.os] || OS_CONFIG["linux"];
        const defaultPath = config.pathDisplay(status.home_dir);

        setState((prev) => ({
          ...prev,
          arch: status.arch,
          installPath: defaultPath,
          step: status.is_installed ? WizardStep.UPDATE : WizardStep.WELCOME,
        }));

        setIsReady(true);
        await invoke("show_wizard_window");
      } catch (error) {
        console.error(error);
        setIsReady(true);
        await getCurrentWindow().show();
      }
    }
    init();
  }, []);

  const nextStep = () => {
    setState((prev) => {
      switch (prev.step) {
        case WizardStep.UPDATE:
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
    if (state.launchOnExit) {
      // Launch logic handled by daemon/OS integration usually, 
      // or user manually launches via the new shortcuts.
    }
    await getCurrentWindow().close();
  };

  const handleCancel = async () => {
    const answer = await ask(
      "Setup is not complete. If you exit now, the program will not be installed.\n\nExit Setup?",
      {
        title: "Exit Setup",
        kind: "warning",
        okLabel: "Exit Setup",
        cancelLabel: "Resume",
      }
    );

    if (answer) {
      await invoke("close_wizard");
    }
  };

  if (!isReady) return null;

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {state.step === WizardStep.UPDATE && (
        <Update onInstall={nextStep} onCancel={handleCancel} />
      )}
      {state.step === WizardStep.WELCOME && (
        <Welcome
          osType={osType}
          isAgreed={state.isAgreed}
          setIsAgreed={(val) => setState((prev) => ({ ...prev, isAgreed: val }))}
          onNext={nextStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.DESTINATION && (
        <Destination
          installPath={state.installPath}
          osType={osType}
          onNext={nextStep}
          onBack={prevStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.READY && (
        <Ready
          osType={osType}
          arch={state.arch}
          installPath={state.installPath}
          onInstall={nextStep}
          onBack={prevStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.INSTALLING && (
        <Installing 
          onComplete={handleInstallComplete} 
          os={osType}
          arch={state.arch}
        />
      )}
      {state.step === WizardStep.FINISHED && (
        <Finish
          launchOnExit={state.launchOnExit}
          setLaunchOnExit={(val) => setState((prev) => ({ ...prev, launchOnExit: val }))}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}
