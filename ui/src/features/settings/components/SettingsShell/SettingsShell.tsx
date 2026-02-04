/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import {
  X,
  Book,
  SettingsIcon,
  Package,
  Fingerprint,
  HelpCircle,
  Sparkles,
} from "lucide-react";

import { UserPreferences } from "@/lib/config/preferences";
import { invoke } from "@tauri-apps/api/core";
import { github } from "@/lib/config";
import { Tooltip } from "@/widgets";

import {
  GeneralSection,
  ModelsSection,
  APIKeysSection,
  PersonalizationSection,
  HelpSection,
} from "@/features/settings";

import styles from "./SettingsShell.module.css";

export type SettingsSection =
  | "general"
  | "models"
  | "apikeys"
  | "personalization"
  | "help";

interface SettingsShellProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;

  currentPrompt: string;
  currentModel: string;
  onPromptChange?: (prompt: string) => void;
  onModelChange?: (model: string) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;

  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  ocrLanguage: string;
  captureType: "rectangular" | "squiggle";
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb",
    key: string,
  ) => Promise<boolean>;
}

export const SettingsShell: React.FC<SettingsShellProps> = ({
  isOpen,
  onClose,
  activeSection,
  onSectionChange,
  currentPrompt,
  currentModel,
  onPromptChange,
  onModelChange,
  updatePreferences,
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  ocrEnabled,
  ocrLanguage,
  captureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const [localPrompt, setLocalPrompt] = useState(currentPrompt);
  const [localModel, setLocalModel] = useState(currentModel);

  const handleToggleAutoExpand = (checked: boolean) => {
    updatePreferences({ autoExpandOCR: checked });
  };

  const handleToggleOcrEnabled = (checked: boolean) => {
    if (!checked) {
      updatePreferences({ ocrEnabled: checked, autoExpandOCR: false });
    } else {
      updatePreferences({ ocrEnabled: checked });
    }
  };

  const handleCaptureTypeChange = (type: "rectangular" | "squiggle") => {
    updatePreferences({ captureType: type });
  };

  const handleToggleTheme = () => {
    const newTheme = isDarkMode ? "light" : "dark";
    updatePreferences({ theme: newTheme });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        shellRef.current &&
        !shellRef.current.contains(event.target as Node)
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
    icon,
    label,
    isActive,
    onClick,
  }: {
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
      className={`${styles.settingsShell} ${isOpen ? styles.open : ""}`}
      ref={containerRef}
    >
      <div
        ref={shellRef}
        className={`${styles.shell} ${isOpen ? styles.open : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.spacer} />

          <div className={styles.sidebarSection}>
            <SidebarButtonWithTooltip
              icon={<SettingsIcon size={22} />}
              label="General"
              isActive={activeSection === "general"}
              onClick={() => onSectionChange("general")}
            />
            <SidebarButtonWithTooltip
              icon={<Package size={22} />}
              label="Models"
              isActive={activeSection === "models"}
              onClick={() => onSectionChange("models")}
            />
            <SidebarButtonWithTooltip
              icon={<Fingerprint size={22} />}
              label="API Keys"
              isActive={activeSection === "apikeys"}
              onClick={() => onSectionChange("apikeys")}
            />
            <SidebarButtonWithTooltip
              icon={<Sparkles size={22} />}
              label="Personalization"
              isActive={activeSection === "personalization"}
              onClick={() => onSectionChange("personalization")}
            />
          </div>

          <div className={styles.spacer} />

          <div className={`${styles.sidebarSection} ${styles.footer}`}>
            <SidebarButtonWithTooltip
              icon={<HelpCircle size={22} />}
              label="Help & Support"
              isActive={activeSection === "help"}
              onClick={() => onSectionChange("help")}
            />
            <SidebarButtonWithTooltip
              icon={<Book size={22} />}
              label="Documentation"
              onClick={() =>
                invoke("open_external_url", { url: github.docs() })
              }
            />
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.sectionContent}>
            {activeSection === "general" && (
              <GeneralSection
                isDarkMode={isDarkMode}
                onToggleTheme={onToggleTheme}
                autoExpandOCR={autoExpandOCR}
                onToggleAutoExpand={handleToggleAutoExpand}
                ocrEnabled={ocrEnabled}
                onToggleOcrEnabled={handleToggleOcrEnabled}
                captureType={captureType}
                onCaptureTypeChange={handleCaptureTypeChange}
              />
            )}
            {activeSection === "models" && (
              <ModelsSection
                localModel={localModel}
                setLocalModel={setLocalModel}
                ocrLanguage={ocrLanguage}
                updatePreferences={updatePreferences}
              />
            )}
            {activeSection === "apikeys" && (
              <APIKeysSection
              // geminiKey={geminiKey}
              // imgbbKey={imgbbKey}
              // onSetAPIKey={onSetAPIKey}
              />
            )}
            {activeSection === "personalization" && (
              <PersonalizationSection
              // localPrompt={localPrompt}
              // currentPrompt={currentPrompt}
              // setLocalPrompt={setLocalPrompt}
              // updatePreferences={updatePreferences}
              />
            )}
            {activeSection === "help" && <HelpSection />}
          </div>
        </div>
      </div>
    </div>
  );
};
