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
import { DEFAULT_MODEL, DEFAULT_PROMPT } from "@/lib/utils/constants";
import { SettingsSection } from "@/features/settings";

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
  const [startupOcrLanguage, setStartupOcrLanguage] =
    useState<string>("PP-OCRv4 (English)");
  const [sessionOcrLanguage, setSessionOcrLanguage] =
    useState<string>("PP-OCRv4 (English)");
  const [downloadedOcrLanguages, setDownloadedOcrLanguages] = useState<
    string[]
  >(["PP-OCRv4 (English)"]);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [originalPicture, setOriginalPicture] = useState<string | null>(null);

  // Profile management
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const activeProfileRef = useRef<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showExistingProfileDialog, setShowExistingProfileDialog] =
    useState(false);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  const [startupImage, setStartupImage] = useState<{
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    imageId?: string;
    fromHistory?: boolean;
  } | null>(null);

  const [sessionChatTitle, setSessionChatTitle] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");

  const [systemError, setSystemError] = useState<string | null>(null);
  const clearSystemError = () => setSystemError(null);

  // Flag to coordinate startup: loadProfileData waits for prefs to be applied
  const [prefsLoaded, setPrefsLoaded] = useState(false);

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
          setStartupOcrLanguage(prefs.ocrLanguage);
          setSessionOcrLanguage(prefs.ocrLanguage);
        }
        if (prefs.downloadedOcrLanguages) {
          setDownloadedOcrLanguages(prefs.downloadedOcrLanguages);
        }

        if (prefs.theme) {
          setTheme(prefs.theme);
        }

        // Handle Active Account Logic
        const activeAccountId = prefs.activeAccount;
        console.log(
          "[useSystemSync] Checking active account preference:",
          activeAccountId,
        );

        if (activeAccountId && activeAccountId !== "Guest") {
          // We have a stored profile ID, try to activate it
          try {
            // Verify it exists first to avoid errors?
            // Actually setActiveProfile in backend should handle if it doesn't exist (or we catch error)
            // But let's check if it's in the list later?
            // For now, let's just try to set it.
            // NOTE: We need to make sure we don't conflict with loadProfileData()
            // which runs right after.
            // Ideally, we set the active profile in backend BEFORE loadProfileData runs.
            await commands.setActiveProfile(activeAccountId);
          } catch (e) {
            console.error(
              "[useSystemSync] Failed to restore active account:",
              e,
            );
            // Fallback to Guest
            await invoke("logout");
            updatePreferences({ activeAccount: "Guest" });
          }
        } else {
          // Guest mode or explicit logout
          // Ensure backend is also logged out
          try {
            await invoke("logout");
          } catch (e) {
            console.error("[useSystemSync] Failed to ensure guest mode:", e);
          }
        }
      } else {
        setTheme("system");
        // No prefs file yet, default is Guest. Ensure backend matches.
        try {
          await invoke("logout");
        } catch (e) {}
      }
      // Signal that prefs are loaded and backend state is set
      setPrefsLoaded(true);
    };
    init();
  }, []);

  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(
    null,
  );

  // Moved loadProfileData outside useEffect to be reusable
  const loadProfileData = async () => {
    try {
      // First, get active profile
      const profile = await commands.getActiveProfile();
      if (!profile) {
        // No active profile - user needs to log in
        console.log("No active profile found");
        setActiveProfile(null);
        setUserName("");
        setUserEmail("");
        setAvatarSrc("");
        setOriginalPicture(null);
        setApiKey("");
        setImgbbKey("");
        return;
      }

      setActiveProfile(profile);
      setUserName(profile.name);
      setUserEmail(profile.email);
      if (profile.avatar) {
        setAvatarSrc(profile.avatar);
      }

      // Get API keys for active profile
      try {
        const apiKey = await invoke<string>("get_api_key", {
          provider: "google ai studio",
          profileId: profile.id,
        });
        console.log(
          "[useSystemSync] Gemini key retrieved:",
          apiKey ? "FOUND" : "EMPTY",
        );
        if (apiKey) {
          setApiKey(apiKey);
          initializeGemini(apiKey);
        } else {
          setApiKey("");
        }
      } catch (e) {
        console.error("[useSystemSync] Failed to retrieve Gemini key:", e);
        setApiKey("");
      }

      try {
        const imgbbApiKey = await invoke<string>("get_api_key", {
          provider: "imgbb",
          profileId: profile.id,
        });
        console.log(
          "[useSystemSync] ImgBB key retrieved:",
          imgbbApiKey ? "FOUND" : "EMPTY",
        );
        if (imgbbApiKey) {
          setImgbbKey(imgbbApiKey);
        } else {
          setImgbbKey("");
        }
      } catch (e) {
        console.error("[useSystemSync] Failed to retrieve ImgBB key:", e);
        setImgbbKey("");
      }

      // Load all profiles for switcher
      const allProfiles = await commands.listProfiles();
      // Sort profiles by name to keep order stable
      allProfiles.sort((a, b) => a.name.localeCompare(b.name));
      setProfiles(allProfiles);
    } catch (e) {
      console.error("Config load error", e);
      setSystemError("Failed to load configuration.");
    }
  };

  useEffect(() => {
    // Wait for preferences to be loaded before reading profile data
    if (!prefsLoaded) return;

    let unlisteners: (() => void)[] = [];
    loadProfileData();

    // Listen for auth-success to refresh profile data
    const authListen = listen<any>("auth-success", async (event) => {
      const data = event.payload;

      // Check if re-authenticating the same active profile
      if (
        activeProfileRef.current &&
        data &&
        activeProfileRef.current.id === data.id
      ) {
        console.log("Re-authenticated same profile, showing dialog");
        setShowExistingProfileDialog(true);
        return;
      }

      // 1. LOCK: Show loading state immediately to prevent race conditions
      setSwitchingProfileId("creating_account");

      // 2. RESET: Clear the board to avoid "ghost data"
      console.log("[useSystemSync] Auth Success: Resetting Session & Keys");
      setStartupImage(null);
      setSessionChatTitle(null);
      setApiKey("");
      setImgbbKey("");
      setActiveProfile(null);
      setUserName("");
      setUserEmail("");
      setAvatarSrc("");
      setOriginalPicture(null);

      // Artificial delay to let React flush the "Reset" state to UI
      // This ensures the user sees the empty state before new data loads
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 3. PROCESS: Load ALL profile data from backend (including keys)
      try {
        await loadProfileData();
      } catch (e) {
        console.error("Failed to load profile data after auth:", e);
      }

      // 4. UNLOCK: Restore UI interactivity
      setSwitchingProfileId(null);

      // 5. PERSIST: Update preferences
      if (data && data.id) {
        updatePreferences({ activeAccount: data.id });
      }
    });
    authListen.then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [prefsLoaded]);

  // ... (rest of code)

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
      setStartupOcrLanguage(updates.ocrLanguage);
      setSessionOcrLanguage(updates.ocrLanguage);
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

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setIsSettingsOpen(true);
  };

  const handleLogout = async () => {
    try {
      await invoke("logout");
      setActiveProfile(null);
      setApiKey("");
      setImgbbKey("");
      setStartupImage(null);
      setSessionChatTitle(null);
      setUserName("");
      setUserEmail("");
      setAvatarSrc("");
      setOriginalPicture(null);
      await updatePreferences({ activeAccount: "Guest" });
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleSetAPIKey = async (
    provider: "google ai studio" | "imgbb",
    key: string,
  ) => {
    if (!activeProfile) {
      console.error(
        "[useSystemSync] No active profile - cannot save API key. Profile state:",
        activeProfile,
      );
      return false;
    }
    try {
      console.log(
        `[useSystemSync] Saving ${provider} key for profile ${activeProfile.id}`,
      );
      await commands.setApiKey(provider, key, activeProfile.id);
      if (provider === "google ai studio") {
        setApiKey(key);
        initializeGemini(key);
      } else {
        setImgbbKey(key);
      }
      return true;
    } catch (e) {
      console.error(`[useSystemSync] Failed to set ${provider} API key:`, e);
      return false;
    }
  };

  const switchProfile = async (profileId: string) => {
    try {
      setSwitchingProfileId(profileId);
      await commands.setActiveProfile(profileId);

      // Do NOT clear state here. Wait for loadProfileData to update it atomically.

      await new Promise((resolve) => setTimeout(resolve, 500)); // Delay for spinner visibility

      await loadProfileData();
      await updatePreferences({ activeAccount: profileId });
    } catch (e) {
      console.error("Failed to switch profile:", e);
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const addAccount = async () => {
    setSwitchingProfileId("creating_account");

    const performAuth = async () => {
      // 2 minutes timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth Timeout")), 120000),
      );
      await Promise.race([commands.startGoogleAuth(), timeoutPromise]);
    };

    try {
      await performAuth();
      // Don't reset here! Loading clears on auth-success event or cancellation
    } catch (e: any) {
      const errorMsg = String(e);
      if (
        errorMsg.includes("Authentication already in progress") ||
        errorMsg.includes("Address in use") ||
        errorMsg.includes("OSError")
      ) {
        console.warn("Auth blocked, attempting to cleanup and retry...");
        try {
          await commands.cancelGoogleAuth();
          await new Promise((resolve) => setTimeout(resolve, 500));
          await performAuth();
          // Don't reset here - auth-success will handle it
        } catch (retryErr) {
          console.error("Failed to restart auth:", retryErr);
          setSwitchingProfileId(null);
        }
      } else {
        console.error("Failed to start auth:", e);
        if (errorMsg.includes("Auth Timeout")) {
          console.warn("Auth timed out, cancelling backend process...");
          try {
            await commands.cancelGoogleAuth();
          } catch (cancelErr) {
            console.error("Failed to cancel timed out auth:", cancelErr);
          }
        }
        setSwitchingProfileId(null);
      }
    }
  };

  const cancelAuth = async () => {
    try {
      await commands.cancelGoogleAuth();
    } catch (e) {
      console.error("Failed to cancel auth:", e);
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const deleteProfile = async (profileId: string) => {
    try {
      await commands.deleteProfile(profileId);
      await loadProfileData();
    } catch (e) {
      console.error("Failed to delete profile:", e);
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
    switchingProfileId,
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
    isSettingsOpen,
    setSettingsOpen: setIsSettingsOpen,
    settingsSection,
    setSettingsSection,
    openSettings,
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
    startupOcrLanguage,
    sessionOcrLanguage,
    setSessionOcrLanguage,
    downloadedOcrLanguages,
    imgbbKey,
    setImgbbKey,
    handleSetAPIKey,
    setAvatarSrc,
    activeProfile,
    profiles,
    switchProfile,
    addAccount,
    cancelAuth,
    deleteProfile,
    showExistingProfileDialog,
    setShowExistingProfileDialog,
  };
};
