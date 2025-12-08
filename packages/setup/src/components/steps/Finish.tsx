/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { StepLayout } from "../StepLayout";
import { Check } from "lucide-react";

interface Props {
  launchOnExit: boolean;
  setLaunchOnExit: (val: boolean) => void;
  onFinish: () => void;
}

export const Finish: React.FC<Props> = ({
  launchOnExit,
  setLaunchOnExit,
  onFinish,
}) => {
  return (
    <StepLayout
      title="Completing the Spatialshot Setup Wizard"
      description=""
      hideButtons={false}
      hideHeader={true}
      nextLabel="Finish"
      isFinish
      onNext={onFinish}
    >
      <div className="flex h-full -m-5">
        <div className="w-[246px] pl-8 relative shrink-0">
          <img
            src="/assets/app.svg"
            alt="Setup Wizard"
            className="w-full h-full object-contain object-center"
          />
        </div>

        <div className="flex-1 px-8 pb-8 pt-20 flex flex-col bg-white">
          <h3 className="text-xl font-bold text-gray-900 mb-4 leading-tight">
            Completing the Spatialshot Setup Wizard
          </h3>

          <p className="text-sm text-gray-700 mb-4">
            Setup has finished installing Spatialshot on your computer. The
            application may be launched by selecting the installed icons.
          </p>

          <p className="text-sm text-gray-700 mb-6">
            Click Finish to exit Setup.
          </p>

          <div className="mt-2">
            <label className="flex items-center cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={launchOnExit}
                  onChange={(e) => setLaunchOnExit(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-200 ${
                    launchOnExit
                      ? "bg-blue-600 border-blue-600 shadow-sm"
                      : "bg-white border-gray-300 group-hover:border-blue-400"
                  }`}
                >
                  <Check
                    size={14}
                    className={`text-white transition-opacity duration-200 ${
                      launchOnExit ? "opacity-100" : "opacity-0"
                    }`}
                    strokeWidth={3}
                  />
                </div>
              </div>
              <span className="ml-3 text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                Launch Spatialshot
              </span>
            </label>
          </div>

          <div className="flex-1"></div>
        </div>
      </div>
    </StepLayout>
  );
};
