/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings,
  HardDrive,
  Sparkles,
  Lock,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import styles from "./SettingsPanel.module.css";
import { Topic } from "@/features/settings";
import { github } from "@/lib/config";

interface SettingsPanelProps {
  activeTopic: Topic;
  setActiveTopic: (topic: Topic) => void;
}

const EDGE_PADDING = 8;

const Tooltip: React.FC<{
  text: string;
  parentRef: React.RefObject<HTMLElement | null>;
  show: boolean;
}> = ({ text, parentRef, show }) => {
  const [style, setStyle] = useState<React.CSSProperties>({
    opacity: 0,
    visibility: "hidden",
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !parentRef.current) {
      setStyle({ opacity: 0, visibility: "hidden" });
      return;
    }

    const update = () => {
      if (!parentRef.current || !ref.current) return;
      const parentRect = parentRef.current.getBoundingClientRect();
      const tooltipRect = ref.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      const gap = 8;
      let left = parentRect.right + gap;
      let top = parentRect.top + parentRect.height / 2 - tooltipRect.height / 2;

      if (left + tooltipRect.width > windowWidth - EDGE_PADDING) {
        left = parentRect.left - gap - tooltipRect.width;
      }

      setStyle({
        position: "fixed",
        top: top,
        left: left,
        opacity: 1,
        visibility: "visible",
        zIndex: 9999,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [show, text]);

  if (!show)
    return createPortal(
      <div ref={ref} className={styles.tooltipText} style={{ opacity: 0 }}>
        {text}
      </div>,
      document.body,
    );

  return createPortal(
    <div ref={ref} className={styles.tooltipText} style={style}>
      {text}
    </div>,
    document.body,
  );
};

interface NavButtonProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({
  icon: Icon,
  label,
  isActive,
  onClick,
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <>
      <button
        ref={btnRef}
        className={`${styles.navItem} ${isActive ? styles.navActive : ""}`}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Icon size={18} className={styles.navIcon} />
      </button>
      <Tooltip text={label} parentRef={btnRef} show={hover} />
    </>
  );
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  activeTopic,
  setActiveTopic,
}) => {
  const menuItems = [
    { id: "General", icon: Settings, label: "General" },
    { id: "Models", icon: HardDrive, label: "Models" },
    { id: "Personal Context", icon: Sparkles, label: "Personal Context" },
    { id: "Providers & Keys", icon: Lock, label: "Providers & Keys" },
    { id: "Help & Support", icon: HelpCircle, label: "Help & Support" },
  ];

  return (
    <aside className={styles.sidebar}>
      {/* Navigation */}
      <nav className={styles.navigation}>
        <div className={styles.navGroup}>
          {menuItems.map((item) => (
            <NavButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              isActive={activeTopic === item.id}
              onClick={() => setActiveTopic(item.id as Topic)}
            />
          ))}
        </div>

        <div className={styles.navFooter}>
          <NavButton
            icon={BookOpen}
            label="Documentation"
            isActive={false}
            onClick={() => invoke("open_external_url", { url: github.docs() })}
          />
        </div>
      </nav>
    </aside>
  );
};