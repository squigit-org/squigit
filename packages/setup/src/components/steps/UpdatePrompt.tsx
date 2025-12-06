import React from 'react';
import { StepLayout } from '../StepLayout';
import { Info, Wrench } from 'lucide-react';

interface Props {
  onInstall: () => void;
  onCancel: () => void;
}

export const UpdatePrompt: React.FC<Props> = ({ onInstall, onCancel }) => {
  return (
    <StepLayout
      title="Spatialshot Update"
      description="A previous version of Spatialshot was detected."
      icon={<Wrench size={24} />}
      onNext={onInstall}
      onCancel={onCancel}
      nextLabel="Install"
      cancelLabel="Cancel"
      isInstallAction
      hideButtons={false}
    >
      <div className="flex flex-col h-full justify-center items-center text-center space-y-6">
        <div className="bg-blue-50 p-4 rounded border border-blue-100 flex items-start text-left max-w-md">
          <Info className="text-blue-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <div className="space-y-2">
            <p className="font-medium text-blue-900">Spatialshot is already installed.</p>
            <p className="text-blue-800 text-sm leading-relaxed">
              Do you want to update to the latest version? This will overwrite the existing installation files but preserve your configuration.
            </p>
          </div>
        </div>
      </div>
    </StepLayout>
  );
};
