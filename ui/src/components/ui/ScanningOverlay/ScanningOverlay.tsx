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
    if (isVisible) {
      setShouldRender(true);
      // Wait a tick to ensure DOM is present before fading in (if we were adding a fade-in too),
      // but mainly we just want to ensure we aren't flagged as fading out.
      requestAnimationFrame(() => setIsFadingOut(false));
    } else {
      // Start fade out
      setIsFadingOut(true);
      const timer = setTimeout(() => {
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
    const worker = new ScanningWorker();
    workerRef.current = worker;

    // Use OffscreenCanvas for performance
    // Note: This requires browser support for OffscreenCanvas transfer
    const offscreen = canvas.transferControlToOffscreen();

    const rect = containerRef.current.getBoundingClientRect();

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
      className="scanning-overlay"
      ref={containerRef}
      style={{ opacity: isFadingOut ? 0 : 1 }}
    >
      <canvas ref={canvasRef} className="scanning-canvas" />
    </div>
  );
};
