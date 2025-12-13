/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { createPortal } from "react-dom";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  selectedText: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onCopy,
  selectedText,
}) => {
  if (!selectedText) return null;

  // Use createPortal to render outside the main DOM hierarchy
  // allowing it to sit above everything else (MsgBox, Modals, etc.)
  return createPortal(
    <>
      {/* Invisible overlay to close menu when clicking outside */}
      <div 
        className="fixed inset-0 z-[9998] cursor-default" 
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      
      {/* The actual menu */}
      <div
        id="app-context-menu"
        className="fixed bg-neutral-800 border border-neutral-700 rounded-md shadow-2xl py-1 z-[9999] min-w-[120px]"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to "outside click" listeners
      >
        <button
          onClick={() => {
            onCopy();
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors flex items-center gap-2"
        >
           {/* You can add an icon here if you want */}
           <span>Copy</span>
        </button>
      </div>
    </>,
    document.body
  );
};
