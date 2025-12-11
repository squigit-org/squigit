/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { StepLayout } from "../StepLayout";
import { OS_CONFIG } from "../../constants";

interface Props {
  installPath: string;
  osType: string;
  arch: string;
  onInstall: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export const Ready: React.FC<Props> = ({
  installPath,
  osType,
  arch,
  onInstall,
  onBack,
  onCancel,
}) => {
  
  const config = OS_CONFIG[osType] || OS_CONFIG['linux'];
  const packages = config.packages(arch);
  const tasks = config.tasks;

  return (
    <StepLayout
      title="Ready to Install"
      description="Setup is now ready to begin installing Spatialshot."
      icon={<img src="/assets/steps/emoji_u1f4e6.png" className="w-8 h-8 object-contain" alt="Ready" />}
      onNext={onInstall}
      onBack={onBack}
      onCancel={onCancel}
      nextLabel="Install"
      isInstallAction
    >
      <div className="flex flex-col h-full space-y-4">
        <p className="text-sm text-gray-700 shrink-0">
          Click Install to continue. Review the summary below:
        </p>

        <div className="border border-gray-300 bg-white text-sm p-4 flex-1 overflow-y-auto shadow-inner">
          
          {/* Section 1: Target */}
          <div className="mb-5">
            <span className="font-semibold text-gray-900 block mb-1">
              Target Location:
            </span>
            <div className="flex items-start ml-2 text-gray-600 font-mono text-xs break-all">
              <span className="mr-2 text-gray-400">➜</span>
              <span>{installPath}</span>
            </div>
          </div>

          {/* Section 2: Artifacts */}
          <div className="mb-5">
            <span className="font-semibold text-gray-900 block mb-1">
              Artifacts to download ({arch}):
            </span>
            <ul className="ml-2 font-mono text-xs text-gray-600 space-y-1">
              {packages.map((pkg, idx) => {
                const isLast = idx === packages.length - 1;
                return (
                  <li key={pkg.name} className="flex">
                    <span className="mr-2 text-gray-400">
                      {isLast ? "└──" : "├──"}
                    </span>
                    <span className="flex-1 truncate">
                        {pkg.name} <span className="text-gray-400 ml-1">({pkg.size})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Section 3: Tasks */}
          <div>
            <span className="font-semibold text-gray-900 block mb-1">
              Configuration Tasks:
            </span>
            <ul className="ml-2 text-xs text-gray-600 space-y-1">
              {tasks.map((task, idx) => {
                 const isLast = idx === tasks.length - 1;
                 return (
                    <li key={idx} className="flex">
                        <span className="mr-2 text-gray-400 font-mono">
                            {isLast ? "└──" : "├──"}
                        </span>
                        <span>{task}</span>
                    </li>
                 )
              })}
            </ul>
          </div>
        </div>

        <div className="mt-auto pt-2 shrink-0">
           <div className="flex items-start text-xs text-gray-500 bg-gray-50 p-2 border border-gray-200 rounded">
                <span className="mr-2">ℹ️</span>
                <span>An active internet connection is required to fetch the latest artifacts.</span>
           </div>
        </div>
      </div>
    </StepLayout>
  );
};
