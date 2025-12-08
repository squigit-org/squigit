/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import { StepLayout } from "../StepLayout";

interface Props {
  onComplete: () => void;
}

export const Installing: React.FC<Props> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing setup...");
  const completedRef = useRef(false);

  useEffect(() => {
    let interval: number;

    const runProgress = () => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 100;
        }

        let increment = Math.random() * 2;
        if (prev < 20) increment = 0.5;
        else if (prev > 80) increment = 0.3;

        const next = Math.min(prev + increment, 100);

        if (next < 10) setStatus("Creating directories...");
        else if (next < 30) setStatus("Downloading daemon-win-x64.zip...");
        else if (next < 50) setStatus("Extracting capture-win-x64.zip...");
        else if (next < 80) setStatus("Installing spatialshot-win-x64.zip...");
        else if (next < 95) setStatus("Registering components...");
        else setStatus("Finalizing installation...");

        return next;
      });
    };

    interval = window.setInterval(runProgress, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100 && !completedRef.current) {
      completedRef.current = true;
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  return (
    <StepLayout
      title="Installing"
      description="Please wait while Setup installs Spatialshot on your computer."
      icon={
        <img
          src="/assets/steps/emoji_u1f6e0.png"
          className="w-8 h-8 object-contain"
          alt="Installing"
        />
      }
      hideButtons={true}
    >
      <div className="flex flex-col justify-center h-full space-y-6">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{status}</span>
            <span>{Math.floor(progress)}%</span>
          </div>

          <div className="h-5 w-full bg-gray-200 border border-gray-300 rounded-sm relative overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-100 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute top-0 left-0 right-0 h-[50%] bg-white opacity-20"></div>
            </div>
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "linear-gradient(45deg,rgba(0,0,0,.15) 25%,transparent 25%,transparent 50%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.15) 75%,transparent 75%,transparent)",
                backgroundSize: "1rem 1rem",
              }}
            ></div>
          </div>
        </div>

        <div className="text-xs text-gray-500 text-center pt-8">
          <p>This process may take several minutes.</p>
          <p>Do not turn off your computer.</p>
        </div>
      </div>
    </StepLayout>
  );
};
