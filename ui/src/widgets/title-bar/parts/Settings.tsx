/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import {
  X,
  Book,
  SettingsIcon,
  Package,
  Fingerprint,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import styles from "./Settings.module.css";
import { Tooltip } from "@/widgets";
import { useState, useRef } from "react";

// Re-export this type if specific to Settings, or import from shared types
export type SettingsSection =
  | "general"
  | "models"
  | "apikeys"
  | "personalization"
  | "help";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  activeSection,
  onSectionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bigDropdownRef = useRef<HTMLDivElement>(null);

  const getSectionTitle = (section: SettingsSection) => {
    switch (section) {
      case "general":
        return "General";
      case "models":
        return "Models";
      case "apikeys":
        return "API Keys";
      case "personalization":
        return "Personalization";
      case "help":
        return "Help & Support";
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close big dropdown
      if (
        isOpen &&
        bigDropdownRef.current &&
        !bigDropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const SidebarButtonWithTooltip = ({
    section,
    icon,
    label,
    isActive,
    onClick,
  }: {
    section?: SettingsSection;
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
    onClick: () => void;
  }) => {
    const [hover, setHover] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <button
          ref={btnRef}
          className={`${styles.sidebarButton} ${isActive ? styles.active : ""}`}
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

  return (
    <div
      className={`${styles.bigSettingsPanel} ${isOpen ? styles.open : ""}`}
      ref={containerRef}
    >
      <div
        ref={bigDropdownRef}
        className={`${styles.bigDropdown} ${isOpen ? styles.open : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className={styles.sidebar}>
          {/* Header: Close Button */}
          <div className={styles.sidebarSection}>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.spacer} />

          {/* Navigation Items - Centered by spacer if needed, or stick to top */}
          <div className={styles.sidebarSection}>
            <SidebarButtonWithTooltip
              section="general"
              icon={<SettingsIcon size={22} />}
              label="General"
              isActive={activeSection === "general"}
              onClick={() => onSectionChange("general")}
            />
            <SidebarButtonWithTooltip
              section="models"
              icon={<Package size={22} />}
              label="Models"
              isActive={activeSection === "models"}
              onClick={() => onSectionChange("models")}
            />
            <SidebarButtonWithTooltip
              section="apikeys"
              icon={<Fingerprint size={22} />}
              label="API Keys"
              isActive={activeSection === "apikeys"}
              onClick={() => onSectionChange("apikeys")}
            />
            <SidebarButtonWithTooltip
              section="personalization"
              icon={<Sparkles size={22} />}
              label="Personalization"
              isActive={activeSection === "personalization"}
              onClick={() => onSectionChange("personalization")}
            />
          </div>

          <div className={styles.spacer} />

          {/* Footer: Help/Docs */}
          <div className={`${styles.sidebarSection} ${styles.footer}`}>
            <SidebarButtonWithTooltip
              section="help"
              icon={<HelpCircle size={22} />}
              label="Help & Support"
              isActive={activeSection === "help"}
              onClick={() => onSectionChange("help")}
            />
            <SidebarButtonWithTooltip
              icon={<Book size={22} />}
              label="Documentation"
              onClick={() => {
                // TODO: Open docs link
                console.log("Open Docs");
              }}
            />
          </div>
        </div>

        {/* Content Area */}
        <div className={styles.content}>
          <div className={styles.sectionContent}>
            this is {getSectionTitle(activeSection).toLowerCase()} section
          </div>
        </div>
      </div>
    </div>
  );
};
