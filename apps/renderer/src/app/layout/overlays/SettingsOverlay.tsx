/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Book,
  SettingsIcon,
  Package,
  Fingerprint,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { commands } from "@/platform";
import { github } from "@squigit/core/services/github";
import type { UserPreferences } from "@squigit/core/config";
import { WidgetOverlay, WidgetOverlayIconButton } from "@/components/ui";
import {
  GeneralSettings,
  ModelSettings,
  APIKeySettings,
  IdentitySettings,
  HelpSettings,
  SettingsSection,
} from "@/features/settings";
import { AppContextMenu } from "@/app/layout/menus/AppContextMenu";
import styles from "./SettingsOverlay.module.css";

interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  defaultModel: string;
  defaultOcrLanguage: string;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  themePreference: "dark" | "light" | "system";
  onSetTheme: (theme: "dark" | "light" | "system") => void;
  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  captureType: "traditional" | "squiggle";
  providerApiKey: string;
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
  defaultModel,
  defaultOcrLanguage,
  updatePreferences,
  themePreference,
  onSetTheme,
  autoExpandOCR,
  ocrEnabled,
  captureType,
  providerApiKey,
  imgbbKey,
  onSetAPIKey,
  isGuest = false,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);

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

  const handleCaptureTypeChange = (type: "traditional" | "squiggle") => {
    updatePreferences({ captureType: type });
  };

  return (
    <>
      <WidgetOverlay
        isOpen={isOpen}
        onClose={onClose}
        onContextMenu={handleContextMenu}
        sectionContentClassName={styles.sectionContent}
        sidebarMiddle={
          <>
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
          </>
        }
        sidebarBottom={
          <>
            <SidebarButtonWithTooltip
              icon={<HelpCircle size={22} />}
              label="Help & Support"
              isActive={activeSection === "help"}
              onClick={() => onSectionChange("help")}
            />
            <SidebarButtonWithTooltip
              icon={<Book size={22} />}
              label="Documentation"
              onClick={() => commands.openExternalUrl(github.docs())}
            />
          </>
        }
      >
        {activeSection === "general" && (
          <GeneralSettings
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
          <ModelSettings
            localModel={defaultModel}
            ocrLanguage={defaultOcrLanguage}
            updatePreferences={updatePreferences}
          />
        )}
        {activeSection === "apikeys" && (
          <APIKeySettings
            providerApiKey={providerApiKey}
            imgbbKey={imgbbKey}
            onSetAPIKey={onSetAPIKey}
            isGuest={isGuest}
          />
        )}
        {activeSection === "personalization" && <IdentitySettings />}
        {activeSection === "help" && <HelpSettings />}
      </WidgetOverlay>
      {contextMenu && (
        <AppContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          hasSelection={contextMenu.hasSelection}
        />
      )}
    </>
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
}) => (
  <WidgetOverlayIconButton
    icon={icon}
    label={label}
    isActive={isActive}
    onClick={onClick}
  />
);
