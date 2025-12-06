import React from 'react';
import { StepLayout } from '../StepLayout';
import { PACKAGE_LIST, REQUIRED_SPACE_MB } from '../../constants';

interface Props {
  installPath: string;
  onInstall: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export const Ready: React.FC<Props> = ({ installPath, onInstall, onBack, onCancel }) => {
  return (
    <StepLayout
      title="Ready to Install"
      description="Setup is now ready to begin installing Spatialshot on your computer."
      icon={<span className="text-2xl">📦️</span>}
      onNext={onInstall}
      onBack={onBack}
      onCancel={onCancel}
      nextLabel="Install"
      isInstallAction
    >
      <div className="flex flex-col h-full space-y-4">
        <p className="text-sm text-gray-700">
          Click Install to continue with the installation, or click Back if you want to review or change any settings.
        </p>

        <div className="border border-gray-300 bg-white text-sm p-4 overflow-y-auto flex-1">
          <div className="mb-4">
            <span className="font-semibold text-gray-900 block mb-1">Destination location:</span>
            <div className="flex items-start ml-2 text-gray-600 font-mono text-xs">
              <span className="mr-2 text-gray-400">└──</span>
              <span className="break-all">{installPath}</span>
            </div>
          </div>

          <div className="mb-4">
            <span className="font-semibold text-gray-900 block mb-1">Packages to download:</span>
            <ul className="ml-2 font-mono text-xs text-gray-600 space-y-1">
              {PACKAGE_LIST.map((pkg, idx) => {
                const isLast = idx === PACKAGE_LIST.length - 1;
                return (
                  <li key={pkg.name} className="flex">
                    <span className="mr-2 text-gray-400">{isLast ? '└──' : '├──'}</span>
                    <span className="flex-1">{pkg.name}</span>
                    <span className="text-gray-400">~ {pkg.size}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <span className="font-semibold text-gray-900 block mb-1">Additional tasks:</span>
             <ul className="ml-2 font-mono text-xs text-gray-600 space-y-1">
                <li className="flex">
                    <span className="mr-2 text-gray-400">├──</span>
                    <span className="flex-1">Create a desktop icon</span>
                </li>
                <li className="flex">
                    <span className="mr-2 text-gray-400">├──</span>
                    <span className="flex-1">Add a global hotkey shortcut</span>
                </li>
                <li className="flex">
                    <span className="mr-2 text-gray-400">└──</span>
                    <span className="flex-1">Add to Path (requires shell restart)</span>
                </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-auto pt-2">
           <div className="card" role="dialog" aria-label="Notes">
            <div className="box note">
              <div className="heading">Notes</div>
              • Please stay connected to the internet while the setup is processing.
            </div>
          </div>
        </div>
      </div>
    </StepLayout>
  );
};