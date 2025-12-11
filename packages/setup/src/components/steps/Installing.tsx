/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import { StepLayout } from "../StepLayout";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  onComplete: () => void;
  os: string;
  arch: string;
}

export const Installing: React.FC<Props> = ({ onComplete, os, arch }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing setup...");
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let unlisten: () => void;

    const startInstallation = async () => {
      unlisten = await listen<{ status: string; percentage: number }>(
        "install-progress",
        (event) => {
          setStatus(event.payload.status);
          setProgress(event.payload.percentage);

          if (event.payload.percentage >= 100) {
            setTimeout(onComplete, 1500);
          }
        }
      );

      try {
        await invoke("start_installation", { os, arch });
      } catch (err: any) {
        console.error("Installation Error:", err);
        setError(String(err));
        setStatus("Installation Failed");
      }
    };

    startInstallation();

    return () => {
      if (unlisten) unlisten();
    };
  }, [onComplete, os, arch]);

  useEffect(() => {
    if (error) return;

    const unlistenPromise = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [error]);

  if (error) {
    return (
      <StepLayout
        title="Installation Failed"
        description="An error occurred during installation."
        icon={<img src="/assets/steps/error.png" className="w-8 h-8 object-contain" alt="Error"/>}
        hideButtons={false}
        nextLabel="Retry"
        onNext={() => window.location.reload()}
        cancelLabel="Exit"
        onCancel={() => getCurrentWindow().close()}
      >
        <div className="flex flex-col justify-center h-full space-y-4">
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm font-mono overflow-auto max-h-40">
             {error}
          </div>
          <p className="text-gray-500 text-xs text-center">
             Changes have been rolled back. You can try again or exit.
          </p>
        </div>
      </StepLayout>
    );
  }

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
            <span>{progress.toFixed(0)}%</span>
          </div>

          <div className="h-5 w-full bg-gray-200 border border-gray-300 rounded-sm relative overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300 ease-out relative shadow-[0_0_10px_rgba(37,99,235,0.3)]"
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
