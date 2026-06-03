/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { platform, commands } from "@/platform";
import { loadPreferences, getWizardState, setWizardState, type WizardState } from "@squigit/core/config";
import { resolveOcrModelId } from "@squigit/core/config";
import { initializeBrainProvider } from "@squigit/core/brain/session";
import { useSystemPreferences } from "./useSystemPreferences";
import { useSystemProfile } from "./useSystemProfile";
import { useSystemState } from "./useSystemState";
import { useSystemAuth } from "./useSystemAuth";
import { useSystemApiKeys } from "./useSystemApiKeys";

export const useSystemSync = () => {
  const prefs = useSystemPreferences();
  const profile = useSystemProfile();
  const state = useSystemState();
  const auth = useSystemAuth(profile.setSwitchingProfileId);
  const keys = useSystemApiKeys(profile.activeProfile?.id);

  const checkAgreement = async () => {
    const wizardState = await getWizardState();
    state.setWizardState(wizardState);
    return wizardState;
  };

  const handleSetWizardState = async (newState: WizardState) => {
    state.setWizardState(newState);
    await setWizardState(newState);
  };

  const setAgreementCompleted = async () => {
    if (state.wizardState) {
      await handleSetWizardState({ ...state.wizardState, step: 1, isFinished: true });
    } else {
      await handleSetWizardState({ step: 1, isFinished: true });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const appConstants = await commands.getAppConstants();
      if (cancelled) return;

      const wizardState = await getWizardState();
      if (cancelled) return;

      state.setWizardState(wizardState);
      state.setAppName(appConstants.appName || "Squigit");

      const loadedPrefs = await loadPreferences();
      if (cancelled) return;

      console.log("[useSystemSync] Loaded prefs:", loadedPrefs);

      const loadedPrompt = loadedPrefs.prompt || appConstants.defaultPrompt;
      prefs.setActivePrompt(loadedPrompt);
      prefs.setEditingPrompt(loadedPrompt);

      const loadedModel = loadedPrefs.model || appConstants.defaultModel;
      prefs.setStartupModel(loadedModel);
      prefs.setEditingModel(loadedModel);
      prefs.setSessionModel(loadedModel);

      prefs.setOcrEnabled(
        loadedPrefs.ocrEnabled !== undefined ? loadedPrefs.ocrEnabled : true,
      );
      prefs.setAutoExpandOCR(
        loadedPrefs.autoExpandOCR !== undefined
          ? loadedPrefs.autoExpandOCR
          : true,
      );
      prefs.setCaptureType(
        loadedPrefs.captureType ||
          (appConstants.defaultCaptureType as "rectangular" | "squiggle"),
      );

      const loadedOcrLanguage = resolveOcrModelId(
        loadedPrefs.ocrLanguage,
        appConstants.defaultOcrLanguage,
      );
      prefs.setStartupOcrLanguage(loadedOcrLanguage);
      prefs.setSessionOcrLanguage(
        loadedPrefs.ocrEnabled !== undefined
          ? loadedPrefs.ocrEnabled
            ? loadedOcrLanguage
            : ""
          : loadedOcrLanguage,
      );

      if (loadedPrefs.theme) {
        prefs.setTheme(loadedPrefs.theme);
      } else if (!wizardState.isFinished) {
        prefs.setTheme("system");
      }

      if (!cancelled) {
        state.setPrefsLoaded(true);
      }
    };
    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadProfileData = async () => {
    try {
      const activeProf = await commands.getActiveProfile();
      if (!activeProf) {
        console.log("No active profile found");
        profile.setActiveProfile(null);
        profile.setUserName("");
        profile.setUserEmail("");
        profile.setAvatarSrc("");
        profile.setOriginalPicture(null);
        // setApiKey("");
        // setImgbbKey("");
        return;
      }

      profile.setActiveProfile(activeProf);
      profile.setUserName(activeProf.name);
      profile.setUserEmail(activeProf.email);
      if (activeProf.avatar) {
        profile.setAvatarSrc(activeProf.avatar);
      }

      try {
        const apiKey = await platform.invoke<string>("get_api_key", {
          provider: "google ai studio",
          profileId: activeProf.id,
        });
        console.log(
          "[useSystemSync] AI provider key retrieved:",
          apiKey ? "FOUND" : "EMPTY",
        );
        if (apiKey) {
          keys.setApiKey(apiKey);
          initializeBrainProvider(apiKey);
        } else {
          keys.setApiKey("");
        }
      } catch (e) {
        console.error("[useSystemSync] Failed to retrieve AI provider key:", e);
        keys.setApiKey("");
      }

      try {
        const imgbbApiKey = await platform.invoke<string>("get_api_key", {
          provider: "imgbb",
          profileId: activeProf.id,
        });
        console.log(
          "[useSystemSync] ImgBB key retrieved:",
          imgbbApiKey ? "FOUND" : "EMPTY",
        );
        if (imgbbApiKey) {
          keys.setImgbbKey(imgbbApiKey);
        } else {
          keys.setImgbbKey("");
        }
      } catch (e) {
        console.error("[useSystemSync] Failed to retrieve ImgBB key:", e);
        keys.setImgbbKey("");
      }

      const allProfiles = await commands.listProfiles();

      allProfiles.sort((a, b) => a.name.localeCompare(b.name));
      profile.setProfiles(allProfiles);
    } catch (e) {
      console.error("Config load error", e);
      state.setSystemError("Failed to load configuration.");
    } finally {
      profile.setProfileLoaded(true);
    }
  };

  const activeProfileRef = useRef(profile.activeProfile);
  useEffect(() => {
    activeProfileRef.current = profile.activeProfile;
  }, [profile.activeProfile]);

  useEffect(() => {
    if (!state.prefsLoaded) return;

    let unlisteners: (() => void)[] = [];
    loadProfileData();

    const authListen = platform.listen<any>("auth-success", async (data) => {
      if (
        activeProfileRef.current &&
        data &&
        activeProfileRef.current.id === data.id
      ) {
        console.log("Re-authenticated same profile, showing dialog");
        profile.setShowExistingProfileDialog(true);
        return;
      }

      profile.setSwitchingProfileId("creating_account");

      console.log("[useSystemSync] Auth Success: Resetting Session & Keys");
      state.setStartupImage(null);
      state.setSessionChatTitle(null);
      keys.setApiKey("");
      keys.setImgbbKey("");
      profile.setActiveProfile(null);
      profile.setUserName("");
      profile.setUserEmail("");
      profile.setAvatarSrc("");
      profile.setOriginalPicture(null);

      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        await loadProfileData();
      } catch (e) {
        console.error("Failed to load profile data after auth:", e);
      }

      profile.setSwitchingProfileId(null);

      if (data && data.id) {
        await prefs.updatePreferences({ activeAccount: data.id });
        await checkAgreement();
      }
    });
    authListen.then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [state.prefsLoaded]);

  const handleLogout = async () => {
    try {
      await platform.invoke("logout");
      profile.setActiveProfile(null);
      keys.setApiKey("");
      keys.setImgbbKey("");
      state.setStartupImage(null);
      state.setSessionChatTitle(null);
      profile.setUserName("");
      profile.setUserEmail("");
      profile.setAvatarSrc("");
      profile.setOriginalPicture(null);
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const switchProfile = async (profileId: string) => {
    try {
      profile.setSwitchingProfileId(profileId);
      await commands.setActiveProfile(profileId);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await loadProfileData();
      await checkAgreement();
    } catch (e) {
      console.error("Failed to switch profile:", e);
    } finally {
      profile.setSwitchingProfileId(null);
    }
  };

  const deleteProfile = async (profileId: string) => {
    try {
      await profile.deleteProfile(profileId);

      profile.setProfiles((current) =>
        current.filter((candidate) => candidate.id !== profileId),
      );

      await loadProfileData();
    } catch (e) {
      console.error("Failed to delete profile:", e);
      throw e;
    }
  };

  const resetSession = () => {
    state.setStartupImage(null);
    state.setSessionChatTitle(null);
    prefs.setSessionOcrLanguage(
      prefs.ocrEnabled ? resolveOcrModelId(prefs.startupOcrLanguage) : "",
    );
  };

  return {
    appName: state.appName,
    switchingProfileId: profile.switchingProfileId,
    apiKey: keys.apiKey,
    prompt: prefs.prompt,
    editingPrompt: prefs.editingPrompt,
    setEditingPrompt: prefs.setEditingPrompt,
    startupModel: prefs.startupModel,
    editingModel: prefs.editingModel,
    setEditingModel: prefs.setEditingModel,
    sessionModel: prefs.sessionModel,
    setSessionModel: prefs.setSessionModel,
    startupImage: state.startupImage,
    setStartupImage: state.setStartupImage,
    isSettingsOpen: state.isSettingsOpen,
    setSettingsOpen: state.setIsSettingsOpen,
    settingsSection: state.settingsSection,
    setSettingsSection: state.setSettingsSection,
    openSettings: state.openSettings,
    userName: profile.userName,
    userEmail: profile.userEmail,
    avatarSrc: profile.avatarSrc,
    originalPicture: profile.originalPicture,
    isDarkMode: prefs.isDarkMode,
    themePreference: prefs.theme,
    onSetTheme: prefs.setTheme,
    systemError: state.systemError,
    clearSystemError: state.clearSystemError,
    updatePreferences: prefs.updatePreferences,
    handleLogout,
    wizardState: state.wizardState,
    setWizardState: handleSetWizardState,
    setAgreementCompleted,
    updateUserData: profile.updateUserData,
    sessionChatTitle: state.sessionChatTitle,
    setSessionChatTitle: state.setSessionChatTitle,
    resetSession,
    autoExpandOCR: prefs.autoExpandOCR,
    ocrEnabled: prefs.ocrEnabled,
    captureType: prefs.captureType,
    startupOcrLanguage: prefs.startupOcrLanguage,
    sessionOcrLanguage: prefs.sessionOcrLanguage,
    setSessionOcrLanguage: prefs.setSessionOcrLanguage,
    imgbbKey: keys.imgbbKey,
    setImgbbKey: keys.setImgbbKey,
    handleSetAPIKey: keys.handleSetAPIKey,
    setAvatarSrc: profile.setAvatarSrc,
    activeProfile: profile.activeProfile,
    profileLoaded: profile.profileLoaded,
    profiles: profile.profiles,
    switchProfile,
    addAccount: auth.addAccount,
    cancelAuth: auth.cancelAuth,
    deleteProfile,
    showExistingProfileDialog: profile.showExistingProfileDialog,
    setShowExistingProfileDialog: profile.setShowExistingProfileDialog,
    prefsLoaded: state.prefsLoaded,
  };
};
