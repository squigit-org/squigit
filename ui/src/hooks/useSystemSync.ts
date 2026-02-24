/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initializeGemini } from "@/lib/api/gemini";
import { commands, Profile } from "@/lib/api/tauri";
import { useTheme } from "./useTheme";
import {
  loadPreferences,
  savePreferences,
  hasAgreedFlag,
  setAgreedFlag,
  UserPreferences,
} from "@/lib/storage";
import { SettingsSection } from "@/shell";

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

  const [appName, setAppName] = useState<string>("SnapLLM");
  const [apiKey, setApiKey] = useState<string>("");
  const [imgbbKey, setImgbbKey] = useState<string>("");
  const [activePrompt, setActivePrompt] = useState<string>("");
  const [editingPrompt, setEditingPrompt] = useState<string>("");
  const [startupModel, setStartupModel] = useState<string>("");
  const [editingModel, setEditingModel] = useState<string>("");
  const [sessionModel, setSessionModel] = useState<string>("");
  const [autoExpandOCR, setAutoExpandOCR] = useState<boolean>(true);
  const [ocrEnabled, setOcrEnabled] = useState<boolean>(true);
  useEffect(() => {
    console.log("[useSystemSync] ocrEnabled changed to:", ocrEnabled);
  }, [ocrEnabled]);
  const [captureType, setCaptureType] = useState<"rectangular" | "squiggle">(
    "rectangular",
  );
  const [startupOcrLanguage, setStartupOcrLanguage] = useState<string>("");
  const [sessionOcrLanguage, setSessionOcrLanguage] = useState<string>("");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [originalPicture, setOriginalPicture] = useState<string | null>(null);

  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const activeProfileRef = useRef<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showExistingProfileDialog, setShowExistingProfileDialog] =
    useState(false);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  const [startupImage, setStartupImage] = useState<{
    path: string;
    mimeType: string;
    imageId: string;
    fromHistory?: boolean;
  } | null>(null);

  const [sessionChatTitle, setSessionChatTitle] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");

  const [systemError, setSystemError] = useState<string | null>(null);
  const clearSystemError = () => setSystemError(null);

  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [hasAgreed, setHasAgreed] = useState<boolean | null>(null);

  const checkAgreement = async () => {
    const agreed = await hasAgreedFlag();
    setHasAgreed(agreed);
    return agreed;
  };

  const setAgreementCompleted = async () => {
    await setAgreedFlag();
    setHasAgreed(true);
  };

  useEffect(() => {
    const init = async () => {
      const appConstants = await commands.getAppConstants();
      const agreed = await checkAgreement();
      setAppName(appConstants.appName || "SnapLLM");

      if (agreed) {
        const prefs = await loadPreferences();
        console.log("[useSystemSync] Loaded prefs:", prefs);

        const loadedPrompt = prefs.prompt || appConstants.defaultPrompt;
        setActivePrompt(loadedPrompt);
        setEditingPrompt(loadedPrompt);

        const loadedModel = prefs.model || appConstants.defaultModel;
        setStartupModel(loadedModel);
        setEditingModel(loadedModel);
        setSessionModel(loadedModel);

        setOcrEnabled(prefs.ocrEnabled !== undefined ? prefs.ocrEnabled : true);
        setAutoExpandOCR(
          prefs.autoExpandOCR !== undefined ? prefs.autoExpandOCR : true,
        );
        setCaptureType(
          prefs.captureType ||
            (appConstants.defaultCaptureType as "rectangular" | "squiggle"),
        );

        if (prefs.ocrLanguage) {
          setStartupOcrLanguage(prefs.ocrLanguage);
          setSessionOcrLanguage(prefs.ocrLanguage);
        } else {
          setStartupOcrLanguage(appConstants.defaultOcrLanguage);
          setSessionOcrLanguage(appConstants.defaultOcrLanguage);
        }

        if (prefs.theme) {
          setTheme(prefs.theme);
        }

        const activeAccountId = prefs.activeAccount;
        console.log(
          "[useSystemSync] Checking active account preference:",
          activeAccountId,
        );

        if (activeAccountId && activeAccountId !== "Guest") {
          try {
            await commands.setActiveProfile(activeAccountId);
          } catch (e) {
            console.warn(
              `[useSystemSync] Profile ${activeAccountId} corrupted or missing on disk (Original Error: ${e}). Healing state back to Guest.`,
            );
            await savePreferences({ ...prefs, activeAccount: "Guest" });
          }
        } else {
          try {
            await invoke("logout");
          } catch (e) {
            console.error("[useSystemSync] Failed to ensure guest mode:", e);
          }
        }
      } else {
        setTheme("system");

        const prefs = await loadPreferences();
        console.log("[useSystemSync] Loaded prefs (not agreed):", prefs);

        const loadedPrompt = prefs.prompt || appConstants.defaultPrompt;
        setActivePrompt(loadedPrompt);
        setEditingPrompt(loadedPrompt);
        const loadedModel = prefs.model || appConstants.defaultModel;
        setStartupModel(loadedModel);
        setEditingModel(loadedModel);
        setSessionModel(loadedModel);

        setOcrEnabled(prefs.ocrEnabled !== undefined ? prefs.ocrEnabled : true);
        setAutoExpandOCR(
          prefs.autoExpandOCR !== undefined ? prefs.autoExpandOCR : true,
        );
        setCaptureType(
          prefs.captureType ||
            (appConstants.defaultCaptureType as "rectangular" | "squiggle"),
        );

        const loadedOcrLanguage =
          prefs.ocrLanguage || appConstants.defaultOcrLanguage;
        setStartupOcrLanguage(loadedOcrLanguage);
        setSessionOcrLanguage(loadedOcrLanguage);

        try {
          await invoke("logout");
        } catch (e) {}
      }

      setPrefsLoaded(true);
    };
    init();
  }, []);

  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(
    null,
  );

  const loadProfileData = async () => {
    try {
      const profile = await commands.getActiveProfile();
      if (!profile) {
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

      const allProfiles = await commands.listProfiles();

      allProfiles.sort((a, b) => a.name.localeCompare(b.name));
      setProfiles(allProfiles);
    } catch (e) {
      console.error("Config load error", e);
      setSystemError("Failed to load configuration.");
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => {
    if (!prefsLoaded) return;

    let unlisteners: (() => void)[] = [];
    loadProfileData();

    const authListen = listen<any>("auth-success", async (event) => {
      const data = event.payload;

      if (
        activeProfileRef.current &&
        data &&
        activeProfileRef.current.id === data.id
      ) {
        console.log("Re-authenticated same profile, showing dialog");
        setShowExistingProfileDialog(true);
        return;
      }

      setSwitchingProfileId("creating_account");

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

      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        await loadProfileData();
      } catch (e) {
        console.error("Failed to load profile data after auth:", e);
      }

      setSwitchingProfileId(null);

      if (data && data.id) {
        await updatePreferences({ activeAccount: data.id });
        await checkAgreement();
      }
    });
    authListen.then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [prefsLoaded]);

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
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
    }
    if (updates.theme !== undefined) {
      setTheme(updates.theme);
    }

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

      await new Promise((resolve) => setTimeout(resolve, 500));

      await loadProfileData();
      await updatePreferences({ activeAccount: profileId });
      await checkAgreement();
    } catch (e) {
      console.error("Failed to switch profile:", e);
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const addAccount = async () => {
    setSwitchingProfileId("creating_account");

    const performAuth = async () => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth Timeout")), 120000),
      );
      await Promise.race([commands.startGoogleAuth(), timeoutPromise]);
    };

    try {
      await performAuth();
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
    setSessionOcrLanguage(startupOcrLanguage);
  };

  return {
    appName,
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
    setAgreementCompleted,
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
    imgbbKey,
    setImgbbKey,
    handleSetAPIKey,
    setAvatarSrc,
    activeProfile,
    profileLoaded,
    profiles,
    switchProfile,
    addAccount,
    cancelAuth,
    deleteProfile,
    showExistingProfileDialog,
    setShowExistingProfileDialog,
    prefsLoaded,
  };
};
