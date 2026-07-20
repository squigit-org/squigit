/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check, Copy, FolderOpen, MessageSquare } from "lucide-react";
import { WidgetOverlayIconButton } from "@/components/ui";
import styles from "./MediaSidebar.module.css";

interface MediaSidebarProps {
  onReveal: () => void;
  onCopy: () => void;
  copyLabel: string;
  isCopied?: boolean;
  onRevealInThread?: React.MouseEventHandler<HTMLButtonElement>;
  isRevealInThreadActive?: boolean;
}

export const MediaSidebar: React.FC<MediaSidebarProps> = ({
  onReveal,
  onCopy,
  copyLabel,
  isCopied = false,
  onRevealInThread,
  isRevealInThreadActive = false,
}) => {
  return (
    <>
      {onRevealInThread && (
        <WidgetOverlayIconButton
          icon={<MessageSquare size={22} />}
          label="Reveal in thread"
          isActive={isRevealInThreadActive}
          activeClassName={styles.revealActive}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onRevealInThread}
        />
      )}
      <WidgetOverlayIconButton
        icon={<FolderOpen size={22} />}
        label="Reveal in folder"
        onClick={onReveal}
      />
      <WidgetOverlayIconButton
        icon={isCopied ? <Check size={22} /> : <Copy size={22} />}
        label={isCopied ? "Copied" : copyLabel}
        onClick={onCopy}
      />
    </>
  );
};
