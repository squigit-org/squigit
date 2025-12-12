/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import "./ChatLayout.css"; // Reusing existing overlay styles

export type MsgBoxVariant = "error" | "warning" | "info";

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
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case "error":
        return <AlertCircle size={18} className="text-red-200" />;
      case "warning":
        return <AlertTriangle size={18} className="text-amber-200" />;
      case "info":
        return <Info size={18} className="text-blue-200" />;
    }
  };

  const getButtonClass = (btnVariant?: "primary" | "secondary" | "danger") => {
    const base = "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50";
    switch (btnVariant) {
        case "danger":
            return `${base} border-red-900-50 text-red-200 hover:border-red-500-60 hover:bg-red-500-10`;
        case "primary":
            return `${base} border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700 hover:border-neutral-600`;
        default: // secondary
            return `${base} border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600`;
    }
  };

  return createPortal(
    <div className="error-overlay">
      <div className="error-container">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getIcon()}</div>
          <div className="flex-1">
            {title && <h4 className="text-sm font-semibold text-neutral-200 mb-1">{title}</h4>}
            <p className={`text-sm leading-relaxed ${variant === 'error' ? 'text-red-200' : 'text-neutral-300'}`}>{message}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={action.onClick}
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
