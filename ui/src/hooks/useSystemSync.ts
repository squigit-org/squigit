/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { showToast } from "../components/ui/Notifications/Toast";
import { initializeGemini } from "../lib/api/gemini/client";
import { commands } from "../lib/api/tauri/commands";
import { useTheme } from "./useTheme";
import {
  loadPreferences,
  savePreferences,
  hasPreferencesFile,
} from "../lib/config/preferences";
import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  DEFAULT_THEME,
} from "../lib/utils/constants";

export const useSystemSync = (onToggleSettings: () => void) => {
  const { theme, toggleTheme, setTheme } = useTheme();

  const onToggleSettingsRef = useRef(onToggleSettings);

  useEffect(() => {
    onToggleSettingsRef.current = onToggleSettings;
  }, [onToggleSettings]);

  useEffect(() => {
    const updateNativeBg = async () => {
      const color = theme === "dark" ? "#0a0a0a" : "#ffffff";
      try {
        await commands.setBackgroundColor(color);
      } catch (e) {
        console.error("Failed to set native background color", e);
      }
    };
    updateNativeBg();
  }, [theme]);

  const [apiKey, setApiKey] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>(DEFAULT_PROMPT);
  const [editingPrompt, setEditingPrompt] = useState<string>(DEFAULT_PROMPT);
  const [startupModel, setStartupModel] = useState<string>(DEFAULT_MODEL);
  const [editingModel, setEditingModel] = useState<string>(DEFAULT_MODEL);
  const [sessionModel, setSessionModel] = useState<string>(DEFAULT_MODEL);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");

  const [startupImage, setStartupImage] = useState<{
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null>(null);

  const [sessionLensUrl, setSessionLensUrl] = useState<string | null>(null);
  const [sessionChatTitle, setSessionChatTitle] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const clearSystemError = () => setSystemError(null);

  const [hasAgreed, setHasAgreed] = useState<boolean | null>(null);
  useEffect(() => {
    const init = async () => {
      const agreed = await hasPreferencesFile();
      setHasAgreed(agreed);

      if (agreed) {
        const prefs = await loadPreferences();

        const loadedPrompt = prefs.prompt || DEFAULT_PROMPT;
        setActivePrompt(loadedPrompt);
        setEditingPrompt(loadedPrompt);

        const loadedModel = prefs.model || DEFAULT_MODEL;
        setStartupModel(loadedModel);
        setEditingModel(loadedModel);
        setSessionModel(loadedModel);

        if (prefs.theme) {
          setTheme(prefs.theme);
        }
      } else {
        setTheme(DEFAULT_THEME as "light" | "dark");
      }
    };
    init();
  }, []);

  useEffect(() => {
    let unlisteners: (() => void)[] = [];

    const setupIpc = async () => {
      try {
        const apiKey = await invoke<string>("get_api_key", {
          provider: "gemini",
        });
        if (apiKey) {
          setApiKey(apiKey);
          initializeGemini(apiKey);
        }

        const userData = await invoke<any>("get_user_data");
        if (userData) {
          setUserName(userData.name);
          setUserEmail(userData.email);
          setAvatarSrc(userData.avatar);
        }
      } catch (e) {
        console.error("Config load error", e);
        setSystemError("Failed to load configuration.");
      }
    };

    setupIpc();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [onToggleSettings]);

  const saveSettingsHandler = async (newPrompt: string, newModel: string) => {
    setStartupModel(newModel);
    setEditingModel(newModel);
    setActivePrompt(newPrompt);
    setEditingPrompt(newPrompt);

    try {
      await savePreferences({
        prompt: newPrompt,
        model: newModel,
        theme: theme,
      });
      showToast("Settings saved", "done");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Failed to save`, "error");
    }
  };

  const handleToggleTheme = () => {
    toggleTheme();
  };

  const handleLogout = async () => {
    try {
      await invoke("logout");
      setUserName("");
      setUserEmail("");
      setAvatarSrc("");
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleResetAPIKey = async () => {
    try {
      await invoke("reset_api_key");
      setApiKey("");
      setHasAgreed(null);
      sessionStorage.setItem("update_dismissed", "true");
      window.location.reload();
    } catch (e) {
      showToast("Reset failed", "error");
    }
  };

  const updateUserData = (data: {
    name: string;
    email: string;
    avatar: string;
  }) => {
    setUserName(data.name);
    setUserEmail(data.email);
    setAvatarSrc(data.avatar);
  };

  const resetSession = () => {
    setStartupImage(null);
    setSessionLensUrl(null);
    setSessionChatTitle(null);
  };

  return {
    apiKey,
    prompt: activePrompt,
    editingPrompt,
    setEditingPrompt,
    startupModel,
    editingModel,
    setEditingModel,
    sessionModel,
    setSessionModel,
    startupImage,
    setStartupImage,
    userName,
    userEmail,
    avatarSrc,
    isDarkMode: theme === "dark",
    systemError,
    clearSystemError,
    saveSettings: saveSettingsHandler,
    handleToggleTheme,
    handleLogout,
    handleResetAPIKey,
    hasAgreed,
    setHasAgreed,
    updateUserData,
    sessionLensUrl,
    setSessionLensUrl,
    sessionChatTitle,
    setSessionChatTitle,
    resetSession,
  };
};
