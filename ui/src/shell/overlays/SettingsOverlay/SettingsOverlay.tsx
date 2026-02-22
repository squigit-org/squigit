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

import { UserPreferences } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { github } from "@/lib/config";
import { Tooltip } from "@/primitives";

import {
  GeneralSection,
  ModelsSection,
  APIKeysSection,
  PersonalizationSection,
  HelpSection,
} from "@/features/settings";
import { ShellContextMenu } from "@/shell/menus";

import styles from "./SettingsOverlay.module.css";

export type SettingsSection =
  | "general"
  | "models"
  | "apikeys"
  | "personalization"
  | "help";

interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  currentPrompt: string;
  defaultModel: string;
  defaultOcrLanguage: string;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  themePreference: "dark" | "light" | "system";
  onSetTheme: (theme: "dark" | "light" | "system") => void;
  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  captureType: "rectangular" | "squiggle";
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb",
    key: string,
  ) => Promise<boolean>;
  isGuest?: boolean;
}

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  isOpen,
  onClose,
  activeSection,
  onSectionChange,
  currentPrompt,
  defaultModel,
  defaultOcrLanguage,
  updatePreferences,
  themePreference,
  onSetTheme,
  autoExpandOCR,
  ocrEnabled,
  captureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  isGuest = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const [localPrompt, setLocalPrompt] = useState(currentPrompt);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);

  useEffect(() => {
    setLocalPrompt(currentPrompt);
  }, [currentPrompt]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    const hasSelection = !!selection && selection.toString().length > 0;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection,
    });
  };

  const handleCopy = () => {
    const selection = window.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection.toString());
    }
    setContextMenu(null);
  };

  const handleToggleAutoExpand = (checked: boolean) => {
    updatePreferences({ autoExpandOCR: checked });
  };

  const handleToggleOcrEnabled = (checked: boolean) => {
    updatePreferences({ ocrEnabled: checked });
  };

  const handleCaptureTypeChange = (type: "rectangular" | "squiggle") => {
    updatePreferences({ captureType: type });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const isContextMenu = target.closest('[data-is-context-menu="true"]');
      const isDialog = target.closest('[data-dialog-container="true"]');
      const isTitleBar = target.closest("[data-tauri-drag-region]");

      if (
        isOpen &&
        shellRef.current &&
        !shellRef.current.contains(target as Node) &&
        !isContextMenu &&
        !isDialog &&
        !isTitleBar
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

  return (
    <div
      className={`${styles.settingsOverlay} ${isOpen ? styles.open : ""}`}
      ref={containerRef}
      onContextMenu={handleContextMenu}
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
                themePreference={themePreference}
                onSetTheme={onSetTheme}
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
                localModel={defaultModel}
                ocrLanguage={defaultOcrLanguage}
                updatePreferences={updatePreferences}
              />
            )}
            {activeSection === "apikeys" && (
              <APIKeysSection
                geminiKey={geminiKey}
                imgbbKey={imgbbKey}
                onSetAPIKey={onSetAPIKey}
                isGuest={isGuest}
              />
            )}
            {activeSection === "personalization" && (
              <PersonalizationSection
                localPrompt={localPrompt}
                currentPrompt={currentPrompt}
                setLocalPrompt={setLocalPrompt}
                updatePreferences={updatePreferences}
              />
            )}
            {activeSection === "help" && <HelpSection />}
          </div>
        </div>
      </div>
      {contextMenu && (
        <ShellContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          hasSelection={contextMenu.hasSelection}
        />
      )}
    </div>
  );
};

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
