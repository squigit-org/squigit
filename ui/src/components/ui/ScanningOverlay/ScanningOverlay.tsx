/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import "./ScanningOverlay.css";
// @ts-ignore
import ScanningWorker from "./scanning.worker?worker";

interface ScanningOverlayProps {
  isVisible: boolean;
}

export const ScanningOverlay: React.FC<ScanningOverlayProps> = ({
  isVisible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // We keep the component mounted during the fade-out period
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    console.log(`[ScanningOverlay] isVisible changed to: ${isVisible}`);
    if (isVisible) {
      setShouldRender(true);
      setIsFadingOut(false);
      // Determine if we need to restart the worker?
      // actually the worker is created in the other useEffect when shouldRender becomes true.
      // If we are just toggling visibility while kept mounted (rare case here as shouldRender controls mount),
      // we might need to handle RESTART if we supported it, but currently the component unmounts fully.
      // However, if we went from visible -> hidden (fading) -> visible (cancelled fade),
      // we might need to ensure animation resumes.
      // But currently the other useEffect handles worker creation on mount.
      // If we are fading out, the component is still mounted.
      // If we go back to visible during fade out, we need to make sure it animates.
      // The worker only animates on INIT.
      // Let's just focus on STOP for now. If the user cancels fade out (rapid toggle),
      // we might have a frozen canvas.
      // Ideally we should send "START" or "RESUME" if we wanted to be robust,
      // but the worker doesn't support it yet.
      // Given the use case (OCR finishes -> fade out), rapid toggling is unlikely or handled by unmount/mount.
    } else {
      // Start fade out
      setIsFadingOut(true);

      const timer = setTimeout(() => {
        console.log("[ScanningOverlay] Fade out complete, unmounting...");
        setShouldRender(false);
        setIsFadingOut(false);
      }, 500); // Match CSS transition duration
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!shouldRender || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;

    // Create and store worker
    let worker: Worker;
    try {
      worker = new ScanningWorker();
      workerRef.current = worker;

      worker.onerror = (e) => {
        console.error("[ScanningOverlay] Worker error:", e);
      };
    } catch (e) {
      console.error("[ScanningOverlay] Failed to create worker:", e);
      return;
    }

    // Use OffscreenCanvas for performance
    try {
      const offscreen = canvas.transferControlToOffscreen();
      const rect = containerRef.current.getBoundingClientRect();

      console.log("[ScanningOverlay] Initializing worker...");
      worker.postMessage(
        {
          type: "INIT",
          payload: {
            canvas: offscreen,
            width: rect.width,
            height: rect.height,
          },
        },
        [offscreen]
      );
    } catch (e) {
      console.error(
        "[ScanningOverlay] Failed to transfer control to offscreen:",
        e
      );
      // Fallback or just log? For now just log, as this is critical for this component
    }

    const handleResize = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        worker.postMessage({
          type: "RESIZE",
          payload: { width: r.width, height: r.height },
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      worker.terminate();
      workerRef.current = null;
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return (
    <div
      className={`scanning-overlay ${isFadingOut ? "fading-out" : ""}`}
      ref={containerRef}
    >
      <canvas ref={canvasRef} className="scanning-canvas" />
    </div>
  );
};
