/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { FolderOpen, Copy } from "lucide-react";
import { WidgetOverlayIconButton } from "@/components";

interface MediaSidebarProps {
  onReveal: () => void;
  onCopyPath: () => void;
}

export const MediaSidebar: React.FC<MediaSidebarProps> = ({
  onReveal,
  onCopyPath,
}) => {
  return (
    <>
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
