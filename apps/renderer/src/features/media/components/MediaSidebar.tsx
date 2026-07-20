/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check, Copy, FolderOpen, Loader2, MessageSquare } from "lucide-react";
import { WidgetOverlayIconButton } from "@/components/ui";
import styles from "./MediaSidebar.module.css";

interface MediaSidebarProps {
  onReveal: () => void;
  onCopy: () => void;
  copyLabel: string;
  isCopied?: boolean;
  isCopying?: boolean;
  onRevealInThread?: React.MouseEventHandler<HTMLButtonElement>;
  isRevealInThreadActive?: boolean;
}

export const MediaSidebar: React.FC<MediaSidebarProps> = ({
  onReveal,
  onCopy,
  copyLabel,
  isCopied = false,
  isCopying = false,
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
        icon={
          isCopying ? (
            <Loader2 size={22} className={styles.spinner} />
          ) : isCopied ? (
            <Check size={22} />
          ) : (
            <Copy size={22} />
          )
        }
        label={isCopying ? "Copying" : isCopied ? "Copied" : copyLabel}
        onClick={onCopy}
        disabled={isCopying}
      />
    </>
  );
};
