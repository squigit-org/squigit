/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { FolderOpen, Copy, MessageSquare } from "lucide-react";
import { WidgetOverlayIconButton } from "@/components/ui";

interface MediaSidebarProps {
  onReveal: () => void;
  onCopyPath: () => void;
  onRevealInThread?: () => void;
}

export const MediaSidebar: React.FC<MediaSidebarProps> = ({
  onReveal,
  onCopyPath,
  onRevealInThread,
}) => {
  return (
    <>
      {onRevealInThread && (
        <WidgetOverlayIconButton
          icon={<MessageSquare size={22} />}
          label="Reveal in thread"
          onClick={onRevealInThread}
        />
      )}
      <WidgetOverlayIconButton
        icon={<FolderOpen size={22} />}
        label="Reveal in folder"
        onClick={onReveal}
      />
      <WidgetOverlayIconButton
        icon={<Copy size={22} />}
        label="Copy path"
        onClick={onCopyPath}
      />
    </>
  );
};
