/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { platform } from "@/platform";
import { Check } from "lucide-react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui";
import { usePlatform } from "@/hooks/shared";

interface TitleBarContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onNewThread: () => void;
  onOpenSettings: () => void;
  isAlwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  isWelcome?: boolean;
}

export const TitleBarContextMenu: React.FC<TitleBarContextMenuProps> = ({
  x,
  y,
  onClose,
  onNewThread,
  onOpenSettings,
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
  isWelcome,
}) => {
  const { isMac } = usePlatform();

  const handleMinimize = () => {
    platform.invoke("minimize_window");
    onClose();
  };

  const handleCloseWindow = () => {
    platform.invoke("close_window");
    onClose();
  };

  const handleAlwaysOnTop = () => {
    onToggleAlwaysOnTop();
    onClose();
  };

  const handleNewThread = () => {
    onNewThread();
    onClose();
  };

  const handleSettings = () => {
    onOpenSettings();
    onClose();
  };

  const handleReload = async () => {
    onClose();
    try {
      await platform.invoke("reload_window");
    } catch {
      window.location.reload();
    }
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose} width={220}>
      <ContextMenuItem onClick={handleMinimize}>Minimize</ContextMenuItem>

      <ContextMenuItem
        onClick={handleAlwaysOnTop}
        shortcut={isAlwaysOnTop ? <Check size={14} /> : undefined}
      >
        Always on Top
      </ContextMenuItem>

      <ContextMenuSeparator />

      {!isWelcome && (
        <>
          <ContextMenuItem onClick={handleNewThread}>New thread</ContextMenuItem>
          <ContextMenuItem onClick={handleSettings}>Settings</ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}

      <ContextMenuItem onClick={handleReload}>Reload</ContextMenuItem>

      <ContextMenuItem
        onClick={handleCloseWindow}
        shortcut={isMac ? "Cmd+W" : "Alt+F4"}
      >
        Close
      </ContextMenuItem>
    </ContextMenu>
  );
};
