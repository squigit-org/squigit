/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { StepLayout } from "../StepLayout";
import { REQUIRED_SPACE_MB } from "../../constants";
import { HardDrive, Lock } from "lucide-react";

interface Props {
  installPath: string;
  osType: string;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export const Destination: React.FC<Props> = ({
  installPath,
  osType,
  onNext,
  onBack,
  onCancel,
}) => {
  
  const isMac = osType === 'macos';
  const description = isMac 
    ? "Applications are installed to the standard /Applications folder."
    : "The application uses XDG-compliant user directories.";

  return (
    <StepLayout
      title="Destination Location"
      description="Spatialshot will be installed in the following standard location."
      icon={
        <img
          src="/assets/steps/emoji_u1f4c2.png"
          className="w-8 h-8 object-contain"
          alt="Destination"
        />
      }
      onNext={onNext}
      onBack={onBack}
      onCancel={onCancel}
    >
      <div className="flex flex-col space-y-6">
        <div className="bg-blue-50 border border-blue-100 p-4 rounded text-sm text-blue-900">
           <p>
             To ensure system stability and correct permissions, the installation path is fixed for this version.
           </p>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Installation Directory
            </label>
            <div className="relative">
                <input
                type="text"
                value={installPath}
                readOnly
                className="block w-full p-2.5 pl-9 text-sm border border-gray-300 rounded shadow-sm bg-gray-100 text-gray-500 cursor-not-allowed select-none focus:outline-none font-mono"
                />
                <Lock size={14} className="absolute left-3 top-3 text-gray-400" />
            </div>
            <p className="mt-2 text-xs text-gray-500">
                {description}
            </p>
        </div>

        <div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-sm mt-auto">
          <HardDrive size={18} className="text-gray-500 mr-3" />
          <span className="text-sm text-gray-700">
            Approximately <span className="font-semibold">{REQUIRED_SPACE_MB} MB</span> of free disk space is required.
          </span>
        </div>
      </div>
    </StepLayout>
  );
};
