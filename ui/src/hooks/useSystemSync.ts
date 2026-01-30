/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  const [imgbbKey, setImgbbKey] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>(DEFAULT_PROMPT);
  const [editingPrompt, setEditingPrompt] = useState<string>(DEFAULT_PROMPT);
  const [startupModel, setStartupModel] = useState<string>(DEFAULT_MODEL);
  const [editingModel, setEditingModel] = useState<string>(DEFAULT_MODEL);
  const [sessionModel, setSessionModel] = useState<string>(DEFAULT_MODEL);
  const [autoExpandOCR, setAutoExpandOCR] = useState<boolean>(true);
  const [captureType, setCaptureType] = useState<"rectangular" | "squiggle">(
    "rectangular",
  );

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [originalPicture, setOriginalPicture] = useState<string | null>(null);

  const [startupImage, setStartupImage] = useState<{
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    imageId?: string; // CAS hash for chat association
    fromHistory?: boolean;
  } | null>(null);

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

        if (prefs.autoExpandOCR !== undefined) {
          setAutoExpandOCR(prefs.autoExpandOCR);
        }
        if (prefs.captureType) {
          setCaptureType(prefs.captureType);
        }

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
          if (userData.original_picture) {
            setOriginalPicture(userData.original_picture);
          }
        }

        // Load imgbb key
        try {
          const imgbbApiKey = await invoke<string>("get_api_key", {
            provider: "imgbb",
          });
          if (imgbbApiKey) {
            setImgbbKey(imgbbApiKey);
          }
        } catch (e) {
          // imgbb key is optional
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

  const saveSettingsHandler = async (
    newPrompt: string,
    newModel: string,
    newAutoExpandOCR?: boolean,
    newCaptureType?: "rectangular" | "squiggle",
  ) => {
    setStartupModel(newModel);
    setEditingModel(newModel);
    setActivePrompt(newPrompt);
    setEditingPrompt(newPrompt);
    if (newAutoExpandOCR !== undefined) setAutoExpandOCR(newAutoExpandOCR);
    if (newCaptureType) setCaptureType(newCaptureType);

    try {
      await savePreferences({
        prompt: newPrompt,
        model: newModel,
        theme: theme,
        autoExpandOCR: newAutoExpandOCR ?? autoExpandOCR,
        captureType: newCaptureType ?? captureType,
      });
    } catch (e) {
      console.error(e);
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
      setOriginalPicture(null);
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleSetAPIKey = async (provider: "gemini" | "imgbb", key: string) => {
    try {
      await commands.setApiKey(provider, key);
      if (provider === "gemini") {
        setApiKey(key);
        initializeGemini(key);
      } else {
        setImgbbKey(key);
      }
      return true;
    } catch (e) {
      console.error(`Failed to set ${provider} API key`, e);
      return false;
    }
  };

  const updateUserData = (data: {
    name: string;
    email: string;
    avatar: string;
    original_picture?: string;
  }) => {
    setUserName(data.name);
    setUserEmail(data.email);
    setAvatarSrc(data.avatar);
    if (data.original_picture) {
      setOriginalPicture(data.original_picture);
    }
  };

  const resetSession = () => {
    setStartupImage(null);
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
    originalPicture,
    isDarkMode: theme === "dark",
    systemError,
    clearSystemError,
    saveSettings: saveSettingsHandler,
    handleToggleTheme,
    handleLogout,
    hasAgreed,
    setHasAgreed,
    updateUserData,
    sessionChatTitle,
    setSessionChatTitle,
    resetSession,
    autoExpandOCR,
    setAutoExpandOCR,
    captureType,
    setCaptureType,
    imgbbKey,
    setImgbbKey,
    handleSetAPIKey,
  };
};
