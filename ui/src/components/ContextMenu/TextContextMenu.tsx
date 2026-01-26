/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Copy, ClipboardPaste, Scissors, TextSelect } from "lucide-react";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";

interface TextContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  onSelectAll?: () => void;
  selectedText?: string;
  hasSelection?: boolean;
}

export const TextContextMenu: React.FC<TextContextMenuProps> = ({
  x,
  y,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onSelectAll,
  selectedText = "",
  hasSelection = false,
}) => {
  const hasText = hasSelection || selectedText.length > 0;

  // Simple check for Mac to determine modifier key
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl+";

  const showCopy = onCopy && hasText;
  const showCut = onCut && hasText;
  const showPaste = onPaste;
  const showSelectAll = onSelectAll;

  if (!showCopy && !showCut && !showPaste && !showSelectAll) return null;

  return (
    <ContextMenu x={x} y={y} onClose={onClose} width={180}>
      {showCut && (
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onCut!();
            onClose();
          }}
          icon={<Scissors size={14} />}
          shortcut={`${mod}X`}
        >
          Cut
        </ContextMenuItem>
      )}
      {showCopy && (
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onCopy!();
            onClose();
          }}
          icon={<Copy size={14} />}
          shortcut={`${mod}C`}
        >
          Copy
        </ContextMenuItem>
      )}
      {showPaste && (
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onPaste!();
            onClose();
          }}
          icon={<ClipboardPaste size={14} />}
          shortcut={`${mod}V`}
        >
          Paste
        </ContextMenuItem>
      )}
      {showSelectAll && (
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onSelectAll!();
            onClose();
          }}
          icon={<TextSelect size={14} />}
          shortcut={`${mod}A`}
        >
          Select All
        </ContextMenuItem>
      )}
    </ContextMenu>
  );
};
