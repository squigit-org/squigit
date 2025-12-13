/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { Settings, RotateCw } from "lucide-react";
import { SettingsPanel } from "./settings/SettingsPanel";
import { ModelSelector } from "./ModelSelector";
import LensButton from "./LensButton";

interface ChatHeaderProps {
  isPanelActive: boolean;
  toggleSettingsPanel: () => void;
  onReload: () => void;
  isRotating: boolean;
  isPanelVisible: boolean;
  isPanelActiveAndVisible: boolean;
  isPanelClosing: boolean;
  settingsButtonRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  settingsPanelRef: ForwardedRef<{ handleClose: () => Promise<boolean> }>;
  // Settings Panel Props
  prompt: string;
  editingModel: string;
  setPrompt: (prompt: string) => void;
  onEditingModelChange: (model: string) => void;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
  toggleSubview: (isActive: boolean) => void;
  // Model Selector Props
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
  isChatMode: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isPanelActive,
  toggleSettingsPanel,
  onReload,
  isRotating,
  isPanelVisible,
  isPanelActiveAndVisible,
  isPanelClosing,
  settingsButtonRef,
  panelRef,
  settingsPanelRef,
  prompt,
  editingModel,
  setPrompt,
  onEditingModelChange,
  userName,
  userEmail,
  avatarSrc,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  onResetAPIKey,
  toggleSubview,
  currentModel,
  onModelChange,
  isLoading,
  isChatMode,
}) => {
  return (
    <header className="flex items-center justify-between gap-4 p-6">
      <div className="flex items-center gap-2">
        <div className="relative z-50">
          <button
            ref={settingsButtonRef}
            onClick={toggleSettingsPanel}
            className={`p-2 transition-colors rounded-lg ${
              isPanelActive
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
            }`}
            title="Settings"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={onReload}
            className="p-2 transition-colors rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
            title="Reload chat"
            disabled={isRotating}
          >
            <RotateCw size={20} className={isRotating ? "rotating" : ""} />
          </button>
          {isPanelVisible && (
            <div
              className={`panel ${isPanelActiveAndVisible ? "active" : ""} ${
                isPanelClosing ? "closing" : ""
              }`}
              id="panel"
              ref={panelRef}
              style={{
                position: "absolute",
                top: "100%",
                left: "0",
                right: "auto",
                marginTop: "0.5rem",
              }}
            >
              <div className="panel-content" id="settings-content">
                <SettingsPanel
                  ref={settingsPanelRef}
                  currentPrompt={prompt}
                  currentModel={editingModel}
                  onPromptChange={setPrompt}
                  onModelChange={onEditingModelChange}
                  userName={userName}
                  userEmail={userEmail}
                  avatarSrc={avatarSrc}
                  onSave={onSave}
                  onLogout={onLogout}
                  isDarkMode={isDarkMode}
                  onToggleTheme={onToggleTheme}
                  onResetAPIKey={onResetAPIKey}
                  toggleSubview={toggleSubview}
                  toggleSettingsPanel={toggleSettingsPanel}
                />
              </div>
              <div className="footer">
                <p>Spatialshot &copy; 2025</p>
              </div>
            </div>
          )}
        </div>
        <div>
          <ModelSelector
            currentModel={currentModel}
            onModelChange={onModelChange}
            isLoading={isLoading}
          />
        </div>
      </div>
      <LensButton isChatMode={isChatMode} />
    </header>
  );
};
