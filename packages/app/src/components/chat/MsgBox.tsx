/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, Info, Sparkles } from "lucide-react";
import "./ChatLayout.css";

export type MsgBoxVariant = "error" | "warning" | "info" | "update";

export interface MsgBoxAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

interface MsgBoxProps {
  variant?: MsgBoxVariant;
  title?: string;
  message: string;
  actions: MsgBoxAction[];
  isOpen: boolean;
}

export const MsgBox: React.FC<MsgBoxProps> = ({
  variant = "error",
  title,
  message,
  actions,
  isOpen,
}) => {
  // 1. Native "Pop" Sound Effect
  useEffect(() => {
    if (isOpen) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          // Quick pitch drop for a "bubble" sound
          osc.frequency.setValueAtTime(500, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);

          // Volume envelope
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch (e) {
        // Silent fail if audio context not supported or blocked
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case "error":
        return <AlertCircle size={18} className="text-red-200" />;
      case "warning":
        return <AlertTriangle size={18} className="text-amber-200" />;
      case "info":
        return <Info size={18} className="text-blue-200" />;
      case "update":
        return <Sparkles size={18} className="text-purple-300" />;
    }
  };

  const getButtonClass = (btnVariant?: "primary" | "secondary" | "danger") => {
    const base =
      "rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50";
    switch (btnVariant) {
      case "danger":
        return `${base} border-red-900/50 bg-red-950/30 text-red-200 hover:border-red-500/60 hover:bg-red-900/50`;
      case "primary":
        return `${base} border-neutral-600 bg-neutral-100 text-neutral-900 hover:bg-white hover:border-white shadow-[0_0_10px_rgba(255,255,255,0.1)]`;
      default: // secondary
        return `${base} border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700 hover:border-neutral-500`;
    }
  };

  return createPortal(
    // 2. Stop propagation on the overlay click to prevent closing parent panels
    <div 
      className="error-overlay" 
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="error-container animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            {title && (
              <h4 className="text-sm font-semibold text-neutral-100 mb-1">
                {title}
              </h4>
            )}
            <p
              className={`text-sm leading-relaxed ${
                variant === "error" ? "text-red-100" : "text-neutral-300"
              }`}
            >
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              disabled={action.disabled}
              className={getButtonClass(action.variant)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
