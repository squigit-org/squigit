/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initializeGemini } from "@/lib/api/gemini/client";
import { commands, Profile } from "@/lib/api/tauri/commands";
import { useTheme } from "./useTheme";
import {
  loadPreferences,
  savePreferences,
  hasPreferencesFile,
  UserPreferences,
} from "@/lib/config/preferences";
import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  DEFAULT_THEME,
} from "@/lib/utils/constants";

export const useSystemSync = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const updateNativeBg = async () => {
      const color = resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff";
      try {
        await commands.setBackgroundColor(color);
      } catch (e) {
        console.error("Failed to set native background color", e);
      }
    };
    updateNativeBg();
  }, [resolvedTheme]);

  const [apiKey, setApiKey] = useState<string>("");
  const [imgbbKey, setImgbbKey] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>(DEFAULT_PROMPT);
  const [editingPrompt, setEditingPrompt] = useState<string>(DEFAULT_PROMPT);
  const [startupModel, setStartupModel] = useState<string>(DEFAULT_MODEL);
  const [editingModel, setEditingModel] = useState<string>(DEFAULT_MODEL);
  const [sessionModel, setSessionModel] = useState<string>(DEFAULT_MODEL);
  const [autoExpandOCR, setAutoExpandOCR] = useState<boolean>(true);
  const [ocrEnabled, setOcrEnabled] = useState<boolean>(true);
  const [captureType, setCaptureType] = useState<"rectangular" | "squiggle">(
    "rectangular",
  );
  const [ocrLanguage, setOcrLanguage] = useState<string>("PP-OCRv4 (English)");
  const [downloadedOcrLanguages, setDownloadedOcrLanguages] = useState<
    string[]
  >(["PP-OCRv4 (English)"]);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [originalPicture, setOriginalPicture] = useState<string | null>(null);

  // Profile management
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [startupImage, setStartupImage] = useState<{
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    imageId?: string;
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
        if (prefs.ocrEnabled !== undefined) {
          setOcrEnabled(prefs.ocrEnabled);
        }
        if (prefs.captureType) {
          setCaptureType(prefs.captureType);
        }
        if (prefs.ocrLanguage) {
          setOcrLanguage(prefs.ocrLanguage);
        }
        if (prefs.downloadedOcrLanguages) {
          setDownloadedOcrLanguages(prefs.downloadedOcrLanguages);
        }

        if (prefs.theme) {
          setTheme(prefs.theme);
        }
      } else {
        setTheme("system");
      }
    };
    init();
  }, []);

  useEffect(() => {
    let unlisteners: (() => void)[] = [];

    const setupIpc = async () => {
      try {
        // First, get active profile
        const profile = await commands.getActiveProfile();
        if (!profile) {
          // No active profile - user needs to log in
          console.log("No active profile found");
          return;
        }

        setActiveProfile(profile);
        setUserName(profile.name);
        setUserEmail(profile.email);
        if (profile.avatar) {
          setAvatarSrc(profile.avatar);
        }

        // Get API keys for active profile
        const apiKey = await invoke<string>("get_api_key", {
          provider: "gemini",
          profileId: profile.id,
        });
        if (apiKey) {
          setApiKey(apiKey);
          initializeGemini(apiKey);
        }

        try {
          const imgbbApiKey = await invoke<string>("get_api_key", {
            provider: "imgbb",
            profileId: profile.id,
          });
          if (imgbbApiKey) {
            setImgbbKey(imgbbApiKey);
          }
        } catch (e) {}

        // Load all profiles for switcher
        const allProfiles = await commands.listProfiles();
        setProfiles(allProfiles);
      } catch (e) {
        console.error("Config load error", e);
        setSystemError("Failed to load configuration.");
      }
    };

    // Listen for auth-success to refresh profile data
    const authListen = listen<any>("auth-success", async (event) => {
      const data = event.payload;
      if (data) {
        setUserName(data.name);
        setUserEmail(data.email);
        setAvatarSrc(data.avatar || "");
        if (data.original_picture) {
          setOriginalPicture(data.original_picture);
        }
        // Refresh profiles
        const allProfiles = await commands.listProfiles();
        setProfiles(allProfiles);
        const active = await commands.getActiveProfile();
        setActiveProfile(active);
      }
    });
    authListen.then((unlisten) => unlisteners.push(unlisten));

    setupIpc();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    // Update local state immediately
    if (updates.model !== undefined) {
      setStartupModel(updates.model);
      setEditingModel(updates.model);
      setSessionModel(updates.model);
    }
    if (updates.prompt !== undefined) {
      setActivePrompt(updates.prompt);
      setEditingPrompt(updates.prompt);
    }
    if (updates.autoExpandOCR !== undefined) {
      setAutoExpandOCR(updates.autoExpandOCR);
    }
    if (updates.ocrEnabled !== undefined) {
      setOcrEnabled(updates.ocrEnabled);
    }
    if (updates.captureType !== undefined) {
      setCaptureType(updates.captureType);
    }
    if (updates.ocrLanguage !== undefined) {
      setOcrLanguage(updates.ocrLanguage);
    }
    if (updates.downloadedOcrLanguages !== undefined) {
      setDownloadedOcrLanguages(updates.downloadedOcrLanguages);
    }
    if (updates.theme !== undefined) {
      setTheme(updates.theme);
    }

    // Merge with current state and save
    try {
      const currentPrefs = await loadPreferences();
      await savePreferences({ ...currentPrefs, ...updates });
    } catch (e) {
      console.error("Failed to save preferences:", e);
    }
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

  const handleSetAPIKey = async (
    provider: "google ai studio" | "imgbb" | "gemini",
    key: string,
  ) => {
    if (!activeProfile) {
      console.error("No active profile - cannot save API key");
      return false;
    }
    try {
      await commands.setApiKey(provider, key, activeProfile.id);
      if (provider === "google ai studio" || provider === "gemini") {
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

  const switchProfile = async (profileId: string) => {
    try {
      await commands.setActiveProfile(profileId);
      window.location.reload();
    } catch (e) {
      console.error("Failed to switch profile:", e);
    }
  };

  const addAccount = async () => {
    try {
      await commands.startGoogleAuth();
    } catch (e) {
      console.error("Failed to start auth:", e);
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
    isDarkMode: resolvedTheme === "dark",
    themePreference: theme,
    onSetTheme: setTheme,
    systemError,
    clearSystemError,
    updatePreferences,
    handleLogout,
    hasAgreed,
    setHasAgreed,
    updateUserData,
    sessionChatTitle,
    setSessionChatTitle,
    resetSession,
    autoExpandOCR,
    ocrEnabled,
    captureType,
    ocrLanguage,
    downloadedOcrLanguages,
    imgbbKey,
    setImgbbKey,
    handleSetAPIKey,
    setAvatarSrc,
    // Profile management
    activeProfile,
    profiles,
    switchProfile,
    addAccount,
  };
};
