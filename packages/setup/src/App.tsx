import React, { useState } from 'react';
import { WizardStep, InstallerState } from './types';
import { DEFAULT_INSTALL_PATH } from './constants';
import { Welcome } from './components/steps/Welcome';
import { Destination } from './components/steps/Destination';
import { Ready } from './components/steps/Ready';
import { Installing } from './components/steps/Installing';
import { Finish } from './components/steps/Finish';
import { UpdatePrompt } from './components/steps/UpdatePrompt';

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

  const handleFinish = () => {
    if (state.launchOnExit) {
      alert("Simulating app launch: Spatialshot.exe");
    }
    // Reset for demo purposes
    if (confirm("Installer closed. Reset demo?")) {
        window.location.reload();
    }
  };

  const handleCancel = () => {
    if (confirm("Setup is not complete. If you exit now, the program will not be installed.\n\nYou may run Setup again at another time to complete the installation.\n\nExit Setup?")) {
      window.location.reload();
    }
  };

  // Demo toggle for update mode
  const toggleUpdateMode = () => {
    setState(prev => ({ 
        ...prev, 
        step: prev.step === WizardStep.UPDATE_PROMPT ? WizardStep.WELCOME : WizardStep.UPDATE_PROMPT 
    }));
  };

  return (
    <div className="relative">
      {/* Main Installer Window Frame - Increased size */}
      <div className="w-[700px] h-[520px] bg-white shadow-2xl rounded-sm border border-gray-400 flex flex-col overflow-hidden ring-1 ring-black/5">
        
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

      {/* Demo Controls - Outside of the UI */}
      <div className="absolute -bottom-12 left-0 right-0 text-center">
         <button 
            onClick={toggleUpdateMode}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
            disabled={state.step !== WizardStep.WELCOME && state.step !== WizardStep.UPDATE_PROMPT}
         >
            {state.step === WizardStep.UPDATE_PROMPT ? "Switch to Clean Install" : "Simulate Update Scenario"}
         </button>
      </div>
    </div>
  );
}