import React, { useState } from 'react';
import { WizardStep, InstallerState } from './types';
import { DEFAULT_INSTALL_PATH } from './constants';
import { Welcome } from './components/steps/Welcome';
import { Destination } from './components/steps/Destination';
import { Ready } from './components/steps/Ready';
import { Installing } from './components/steps/Installing';
import { Finish } from './components/steps/Finish';
import { UpdatePrompt } from './components/steps/UpdatePrompt';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-shell';

export default function App() {
  // State for the installer
  const [state, setState] = useState<InstallerState>({
    step: WizardStep.WELCOME,
    installPath: DEFAULT_INSTALL_PATH,
    isAgreed: false,
    launchOnExit: true,
  });

  // Action Handlers
  const nextStep = () => {
    setState(prev => {
      switch (prev.step) {
        case WizardStep.UPDATE_PROMPT: return { ...prev, step: WizardStep.INSTALLING };
        case WizardStep.WELCOME: return { ...prev, step: WizardStep.DESTINATION };
        case WizardStep.DESTINATION: return { ...prev, step: WizardStep.READY };
        case WizardStep.READY: return { ...prev, step: WizardStep.INSTALLING };
        default: return prev;
      }
    });
  };

  const prevStep = () => {
    setState(prev => {
      switch (prev.step) {
        case WizardStep.DESTINATION: return { ...prev, step: WizardStep.WELCOME };
        case WizardStep.READY: return { ...prev, step: WizardStep.DESTINATION };
        default: return prev;
      }
    });
  };

  const handleInstallComplete = () => {
    setState(prev => ({ ...prev, step: WizardStep.FINISHED }));
  };

  const handleFinish = async () => {
    // Debugging: Reload to welcome screen instead of closing
    setState({
      step: WizardStep.WELCOME,
      installPath: DEFAULT_INSTALL_PATH,
      isAgreed: false,
      launchOnExit: true,
    });
  };

  const handleCancel = async () => {
    if (confirm("Setup is not complete. If you exit now, the program will not be installed.\n\nYou may run Setup again at another time to complete the installation.\n\nExit Setup?")) {
      await getCurrentWindow().close();
    }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {/* Render Step */}
      {state.step === WizardStep.UPDATE_PROMPT && (
          <UpdatePrompt 
              onInstall={nextStep} 
              onCancel={handleCancel} 
          />
      )}
      {state.step === WizardStep.WELCOME && (
        <Welcome
          isAgreed={state.isAgreed}
          setIsAgreed={(val) => setState(prev => ({ ...prev, isAgreed: val }))}
          onNext={nextStep}
          onCancel={handleCancel}
        />
      )}
      {state.step === WizardStep.DESTINATION && (
        <Destination
          installPath={state.installPath}
          setInstallPath={(val) => setState(prev => ({ ...prev, installPath: val }))}
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
        <Installing
          onComplete={handleInstallComplete}
        />
      )}
      {state.step === WizardStep.FINISHED && (
        <Finish
          launchOnExit={state.launchOnExit}
          setLaunchOnExit={(val) => setState(prev => ({ ...prev, launchOnExit: val }))}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}