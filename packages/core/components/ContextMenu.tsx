/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

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

  return (
    <div
      className="fixed bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
      style={{ top: y, left: x }}
    >
      <button
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="block w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
      >
        Copy
      </button>
    </div>
  );
};
