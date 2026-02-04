/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Settings,
  Package,
  Fingerprint,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import React, { useRef, useEffect, useState } from "react";
import styles from "./SettingsPanel.module.css";
import { SettingsSection } from "../SettingsShell/SettingsShell";

interface SettingsPanelProps {
  onOpenSettings: (section: SettingsSection) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onOpenSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close small dropdown
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleOpenSettings = (section: SettingsSection) => {
    setIsOpen(false);
    onOpenSettings(section);
  };

  return (
    <>
      <div className={styles.settingsPanel} ref={containerRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`${styles.trigger} ${isOpen ? styles.active : ""}`}
        >
          <Settings
            size={22}
            className={`${styles.triggerIcon} ${isOpen ? styles.active : ""}`}
          />
        </button>

        <div className={`${styles.dropdown} ${isOpen ? styles.open : ""}`}>
          <div className={styles.sectionTitle}>Settings</div>
          <div className={styles.actions}>
            <button
              className={styles.actionButton}
              onClick={() => handleOpenSettings("general")}
            >
              <Settings size={18} />
              <span>General</span>
            </button>

            <button
              className={styles.actionButton}
              onClick={() => handleOpenSettings("models")}
            >
              <Package size={18} />
              <span>Models</span>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => handleOpenSettings("apikeys")}
            >
              <Fingerprint size={18} />
              <span>API keys</span>
            </button>

            <div className={styles.divider} />

            <button
              className={styles.actionButton}
              onClick={() => handleOpenSettings("personalization")}
            >
              <Sparkles size={18} />
              <span>Personalization</span>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => handleOpenSettings("help")}
            >
              <HelpCircle size={18} />
              <span>Help & support</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
