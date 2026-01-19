/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import {
  RotateCw,
  ChevronRight,
  Save,
  Sparkles,
  Settings,
  Key,
  ExternalLink,
  LogOut,
  Package,
  Check,
  ArrowUpCircle,
  Github,
  Bug,
  Moon,
  Sun,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MODELS, ModelType } from "../../../../lib/config/models";
import { DEFAULT_MODEL, DEFAULT_PROMPT } from "../../../../lib/utils/constants";
import { getPendingUpdate } from "../../../../hooks/useUpdateCheck";
import { CapturePreview } from "./CapturePreview";
import styles from "./SettingsTab.module.css";
import packageJson from "../../../../../package.json";

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

const modelsWithInfo: ModelInfo[] = [
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-pro")!,
    description: "Strongest",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-flash")!,
    description: "Good",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest")!,
    description: "Fastest",
  },
];

const GITHUB_URL = "https://github.com/a7mddra/spatialshot";
const MAILTO = "mailto:a7mddra@gmail.com?subject=Spatialshot%20Bug%20Report";

export interface SettingsTabHandle {
  isDirty: () => boolean;
  save: () => void;
  scrollToSection: (section: "settings" | "api" | "personal") => void;
}

interface SettingsTabProps {
  // Settings section
  autoExpandOCR: boolean;
  captureType: "rectangular" | "squiggle";
  isDarkMode: boolean;
  onToggleTheme: () => void;

  // API section
  geminiKey: string;
  imgbbKey: string;

  // Personal context section
  currentPrompt: string;
  currentModel: string;

  // User info
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onLogout: () => void;

  // Save handler
  onSave: (
    prompt: string,
    model: string,
    autoExpandOCR?: boolean,
    captureType?: "rectangular" | "squiggle",
  ) => void;
}

export const SettingsTab = forwardRef<SettingsTabHandle, SettingsTabProps>(
  (
    {
      autoExpandOCR,
      captureType,
      isDarkMode,
      onToggleTheme,
      geminiKey,
      imgbbKey,
      currentPrompt,
      currentModel,
      userName,
      userEmail,
      avatarSrc,
      onLogout,
      onSave,
    },
    ref,
  ) => {
    // Local state
    const [localAutoExpand, setLocalAutoExpand] = useState(autoExpandOCR);
    const [localCaptureType, setLocalCaptureType] = useState(captureType);
    const [localPrompt, setLocalPrompt] = useState(currentPrompt);
    const [localModel, setLocalModel] = useState(currentModel);
    const [isRotating, setIsRotating] = useState(false);
    const [isChangingGeminiKey, setIsChangingGeminiKey] = useState(false);
    const [isChangingImgbbKey, setIsChangingImgbbKey] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Section refs for scrolling
    const settingsSectionRef = useRef<HTMLDivElement>(null);
    const apiSectionRef = useRef<HTMLDivElement>(null);
    const personalSectionRef = useRef<HTMLDivElement>(null);

    // Check for pending updates
    const pendingUpdate = getPendingUpdate();

    useEffect(() => {
      setLocalAutoExpand(autoExpandOCR);
      setLocalCaptureType(captureType);
      setLocalPrompt(currentPrompt);
      setLocalModel(currentModel);
    }, [autoExpandOCR, captureType, currentPrompt, currentModel]);

    useEffect(() => {
      setImageError(false);
    }, [avatarSrc]);

    const foundIndex = modelsWithInfo.findIndex((m) => m.id === localModel);
    const currentModelIndex = foundIndex !== -1 ? foundIndex : 1;
    const selectedModel =
      modelsWithInfo[currentModelIndex] || modelsWithInfo[0];

    const hasChanges =
      localPrompt !== currentPrompt ||
      localModel !== currentModel ||
      localAutoExpand !== autoExpandOCR ||
      localCaptureType !== captureType;

    const handleNextModel = () => {
      const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
      setLocalModel(modelsWithInfo[nextIndex].id as ModelType);
    };

    const handleReset = async () => {
      setIsRotating(true);
      setLocalPrompt(DEFAULT_PROMPT);
      setLocalModel(DEFAULT_MODEL);
      setLocalAutoExpand(true);
      setLocalCaptureType("rectangular");
      setTimeout(() => setIsRotating(false), 500);
    };

    const handleSave = () => {
      onSave(localPrompt, localModel, localAutoExpand, localCaptureType);
    };

    const scrollToSection = (section: "settings" | "api" | "personal") => {
      const refs = {
        settings: settingsSectionRef,
        api: apiSectionRef,
        personal: personalSectionRef,
      };
      refs[section]?.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleChangeGeminiKey = async () => {
      setIsChangingGeminiKey(true);
      await invoke("open_external_url", {
        url: "https://aistudio.google.com/app/apikey",
      });
      await invoke("start_clipboard_watcher");
    };

    const handleChangeImgbbKey = async () => {
      setIsChangingImgbbKey(true);
      await invoke("open_external_url", { url: "https://api.imgbb.com/" });
      await invoke("start_clipboard_watcher");
    };

    const handleOpenUrl = (url: string) => {
      invoke("open_external_url", { url });
    };

    const maskKey = (key: string) => {
      if (!key) return "";
      if (key.length <= 8) return "••••••••";
      return key.slice(0, 4) + "••••••••" + key.slice(-4);
    };

    const renderAvatar = () => {
      const isValidSource =
        avatarSrc &&
        !imageError &&
        !avatarSrc.includes("googleusercontent.com/profile/picture/0");

      if (isValidSource) {
        return (
          <img
            key={avatarSrc}
            className={styles.avatar}
            src={avatarSrc}
            alt={userName}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={() => setImageError(true)}
          />
        );
      }

      const initial = userName
        ? userName.charAt(0).toUpperCase()
        : userEmail
          ? userEmail.charAt(0).toUpperCase()
          : "?";

      return <div className={styles.avatarPlaceholder}>{initial}</div>;
    };

    useImperativeHandle(ref, () => ({
      isDirty: () => hasChanges,
      save: handleSave,
      scrollToSection,
    }));

    return (
      <div className={styles.container}>
        {/* ===== LEFT COLUMN (Scrollable) ===== */}
        <div className={styles.leftColumn}>
          <div className={styles.leftContent}>
            {/* ===== SETTINGS SECTION ===== */}
            <div ref={settingsSectionRef} className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <Settings size={22} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Settings</h2>
              </div>

              {/* Theme toggle */}
              <div className={styles.toggleRow} onClick={onToggleTheme}>
                <div className={styles.toggleInfo}>
                  <span className={styles.toggleLabel}>
                    {isDarkMode ? <Moon size={16} /> : <Sun size={16} />} Dark
                    Mode
                  </span>
                  <span className={styles.toggleDescription}>
                    Switch between light and dark themes
                  </span>
                </div>
                <div
                  className={`${styles.toggleSwitch} ${
                    isDarkMode ? styles.active : ""
                  }`}
                />
              </div>

              {/* Auto-expand toggle */}
              <div
                className={styles.toggleRow}
                onClick={() => setLocalAutoExpand(!localAutoExpand)}
              >
                <div className={styles.toggleInfo}>
                  <span className={styles.toggleLabel}>
                    Auto-expand after text detection
                  </span>
                  <span className={styles.toggleDescription}>
                    Automatically show full image when OCR completes
                  </span>
                </div>
                <div
                  className={`${styles.toggleSwitch} ${
                    localAutoExpand ? styles.active : ""
                  }`}
                />
              </div>

              {/* Capture type */}
              <div className={styles.section}>
                <label className={styles.label}>Preferred Capture Mode</label>
                <p className={styles.description}>
                  Choose how you want to select screen regions
                </p>
                <div className={styles.captureTypeRow}>
                  <div className={styles.radioGroup}>
                    <div
                      className={`${styles.radioOption} ${
                        localCaptureType === "rectangular"
                          ? styles.selected
                          : ""
                      }`}
                      onClick={() => setLocalCaptureType("rectangular")}
                    >
                      <div className={styles.radioCircle} />
                      <span className={styles.radioLabel}>Rectangular</span>
                    </div>
                    <div
                      className={`${styles.radioOption} ${
                        localCaptureType === "squiggle" ? styles.selected : ""
                      }`}
                      onClick={() => setLocalCaptureType("squiggle")}
                    >
                      <div className={styles.radioCircle} />
                      <span className={styles.radioLabel}>Free-form</span>
                    </div>
                  </div>
                  <CapturePreview type={localCaptureType} />
                </div>
              </div>
            </div>

            {/* ===== API KEYS SECTION ===== */}
            <div ref={apiSectionRef} className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <Key size={22} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>API Keys</h2>
              </div>

              {/* Gemini API Key */}
              <div className={styles.section}>
                <label className={styles.label}>Gemini API Key</label>
                <div className={styles.keyInputRow}>
                  <span className={styles.keyLabel}>Key:</span>
                  <span className={styles.keyValue}>
                    {geminiKey ? (
                      maskKey(geminiKey)
                    ) : (
                      <span className={styles.keyNotSet}>Not set</span>
                    )}
                  </span>
                  <button
                    className={styles.keyBtn}
                    onClick={handleChangeGeminiKey}
                    disabled={isChangingGeminiKey}
                  >
                    <ExternalLink size={14} />
                    {isChangingGeminiKey ? "Waiting..." : "Change"}
                  </button>
                </div>
                <p className={styles.keyInstructions}>
                  Required for AI features. Copy a new key from Google AI Studio
                  and it will be detected automatically.
                </p>
              </div>

              {/* ImgBB API Key */}
              <div className={styles.section}>
                <label className={styles.label}>ImgBB API Key (Optional)</label>
                <div className={styles.keyInputRow}>
                  <span className={styles.keyLabel}>Key:</span>
                  <span className={styles.keyValue}>
                    {imgbbKey ? (
                      maskKey(imgbbKey)
                    ) : (
                      <span className={styles.keyNotSet}>Not set</span>
                    )}
                  </span>
                  <button
                    className={styles.keyBtn}
                    onClick={handleChangeImgbbKey}
                    disabled={isChangingImgbbKey}
                  >
                    <ExternalLink size={14} />
                    {imgbbKey
                      ? isChangingImgbbKey
                        ? "Waiting..."
                        : "Change"
                      : isChangingImgbbKey
                        ? "Waiting..."
                        : "Set up"}
                  </button>
                </div>
                <p className={styles.keyInstructions}>
                  Enables Google Lens integration for reverse image search. Copy
                  your key from ImgBB and it will be detected automatically.
                </p>
              </div>
            </div>

            {/* ===== PERSONAL CONTEXT SECTION ===== */}
            <div ref={personalSectionRef} className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <Sparkles size={22} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Personal Context</h2>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Custom Prompt</label>
                <p className={styles.description}>
                  Add context about yourself, your preferences, or specific
                  instructions for the AI.
                </p>
                <div className={styles.textareaWrapper}>
                  <textarea
                    className={styles.textarea}
                    placeholder="e.g., I prefer concise answers. I'm a software developer working mainly with React and TypeScript..."
                    value={localPrompt}
                    onChange={(e) => setLocalPrompt(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Default Model</label>
                <p className={styles.description}>
                  Choose your preferred AI model for new conversations.
                </p>
                <div className={styles.modelSelector}>
                  <div className={styles.modelInfo}>
                    <span className={styles.modelName}>
                      {selectedModel?.name}
                    </span>
                    <span className={styles.modelDescription}>
                      {selectedModel?.description}
                    </span>
                  </div>
                  <button
                    className={styles.nextModelBtn}
                    onClick={handleNextModel}
                    title="Next model"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT SIDEBAR (Fixed) ===== */}
        <div className={styles.rightSidebar}>
          <div className={styles.sidebarContent}>
            {/* User Info */}
            <div className={styles.userSection}>
              <div className={styles.userInfo}>
                {renderAvatar()}
                <div className={styles.userDetails}>
                  <p className={styles.userName}>{userName}</p>
                  <p className={styles.userEmail}>{userEmail}</p>
                </div>
                <button
                  className={styles.logoutBtn}
                  onClick={onLogout}
                  title="Log Out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {/* App Info */}
            <div className={styles.sidebarSection}>
              <h4 className={styles.sidebarSectionTitle}>App Version</h4>
              <div className={styles.appInfo}>
                <div className={styles.appVersion}>
                  <Package size={16} className={styles.versionIcon} />
                  <span className={styles.versionText}>
                    v{packageJson.version}
                  </span>
                </div>
                {pendingUpdate ? (
                  <>
                    <div
                      className={`${styles.updateStatus} ${styles.hasUpdate}`}
                    >
                      <ArrowUpCircle size={14} />
                      <span>Update {pendingUpdate.version} available</span>
                    </div>
                    <button
                      className={styles.updateBtn}
                      onClick={() =>
                        handleOpenUrl(`${GITHUB_URL}/releases/latest`)
                      }
                    >
                      <ArrowUpCircle size={14} />
                      Update Now
                    </button>
                  </>
                ) : (
                  <div className={`${styles.updateStatus} ${styles.upToDate}`}>
                    <Check size={14} />
                    <span>You're on the latest version</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className={styles.sidebarSection}>
              <h4 className={styles.sidebarSectionTitle}>Quick Links</h4>
              <div className={styles.quickLinks}>
                <button
                  className={styles.linkBtn}
                  onClick={() => handleOpenUrl(GITHUB_URL)}
                >
                  <Github size={16} />
                  GitHub
                </button>
                <button
                  className={styles.linkBtn}
                  onClick={() => handleOpenUrl(MAILTO)}
                >
                  <Bug size={16} />
                  Report Bug
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.sidebarFooter}>
            <div className={styles.footerActions}>
              <button
                className={styles.footerBtn}
                onClick={handleReset}
                title="Reset to defaults"
              >
                <RotateCw
                  size={14}
                  className={isRotating ? styles.rotating : ""}
                />
                Reset
              </button>
              <button
                className={`${styles.footerBtn} ${styles.primary} ${
                  !hasChanges ? styles.disabled : ""
                }`}
                onClick={handleSave}
                disabled={!hasChanges}
                title="Save changes"
              >
                <Save size={14} />
                Save
              </button>
            </div>
            <p className={styles.footerCopyright}>Spatialshot © 2026</p>
          </div>
        </div>
      </div>
    );
  },
);
