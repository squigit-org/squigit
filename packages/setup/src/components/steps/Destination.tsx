import React from 'react';
import { StepLayout } from '../StepLayout';
import { REQUIRED_SPACE_MB } from '../../constants';
import { FolderOpen, HardDrive } from 'lucide-react';
import { Button } from '../Button';

interface Props {
  installPath: string;
  setInstallPath: (val: string) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export const Destination: React.FC<Props> = ({ installPath, setInstallPath, onNext, onBack, onCancel }) => {
  return (
    <StepLayout
      title="Select Destination Location"
      description="Where should Spatialshot be installed?"
      icon={<FolderOpen size={24} />}
      onNext={onNext}
      onBack={onBack}
      onCancel={onCancel}
    >
      <div className="flex flex-col space-y-6">
        <p className="text-sm text-gray-700">
          Setup will install Spatialshot into the following folder.
        </p>
        
        <p className="text-sm text-gray-700">
          To continue, click Next. If you would like to select a different folder, click Browse.
        </p>

        <div className="flex space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={installPath}
              readOnly
              className="block w-full p-2 text-sm border border-gray-300 rounded-sm shadow-sm bg-gray-100 text-gray-600 pointer-events-none select-none focus:outline-none"
            />
          </div>
          <Button disabled className="!min-w-[70px]">Browse...</Button>
        </div>

        <div className="flex items-center p-3 bg-gray-100 border border-gray-200 rounded-sm">
           <HardDrive size={18} className="text-gray-500 mr-3" />
           <span className="text-sm text-gray-800">At least <span className="font-semibold">{REQUIRED_SPACE_MB} MiB</span> of free disk space is required.</span>
        </div>
      </div>
    </StepLayout>
  );
};