/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { X, FolderOpen, Copy } from "lucide-react";
import { Tooltip } from "@/components";
import styles from "../MediaOverlay.module.css";

interface MediaSidebarProps {
  onClose: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
}

const SidebarButtonWithTooltip = ({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => {
  const [hover, setHover] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        className={styles.sidebarButton}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {icon}
      </button>
      <Tooltip text={label} parentRef={btnRef} show={hover} />
    </>
  );
};

export const MediaSidebar: React.FC<MediaSidebarProps> = ({
  onClose,
  onReveal,
  onCopyPath,
}) => {
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarSection}>
        <button className={styles.closeButton} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={`${styles.sidebarSection} ${styles.footer}`}>
        <SidebarButtonWithTooltip
          icon={<FolderOpen size={22} />}
          label="Reveal in folder"
          onClick={onReveal}
        />
        <SidebarButtonWithTooltip
          icon={<Copy size={22} />}
          label="Copy path"
          onClick={onCopyPath}
        />
      </div>
    </div>
  );
};
