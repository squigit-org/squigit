/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { platform, commands, type Profile } from "@/platform";
import {
  loadPreferences,
  getWizardState,
  setWizardState,
  type WizardState,
} from "@squigit/core/config";
import { resolveOcrModelId } from "@squigit/core/config";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useSystemPreferences } from "./useSystemPreferences";
import { useSystemProfile } from "./useSystemProfile";
import { useSystemState } from "./useSystemState";
import { useSystemAuth } from "./useSystemAuth";

const sortProfilesByName = (profiles: Profile[]) =>
  [...profiles].sort((a, b) => a.name.localeCompare(b.name));

export const useSystemSync = () => {
  const prefs = useSystemPreferences();
  const profile = useSystemProfile();
  const state = useSystemState();
  const auth = useSystemAuth(profile.setSwitchingProfileId);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const imgbbKey = useSettingsStore((s) => s.imgbbKey);
  const clearApiKeys = useSettingsStore((s) => s.clearApiKeys);
  const loadApiKeys = useSettingsStore((s) => s.loadApiKeys);
  const saveApiKey = useSettingsStore((s) => s.saveApiKey);
  const setImgbbKey = useSettingsStore((s) => s.setImgbbKey);
  const avatarHydrationInFlightRef = useRef(new Set<string>());

  const applyActiveProfile = (activeProf: Profile | null) => {
    profile.setActiveProfile(activeProf);

    if (!activeProf) {
      profile.setUserName("");
      profile.setUserEmail("");
      profile.setAvatarSrc("");
      profile.setAvatarUrl(null);
      return;
    }

    profile.setUserName(activeProf.name);
    profile.setUserEmail(activeProf.email);
    profile.setAvatarSrc(activeProf.avatar_base64 || activeProf.avatar_url || "");
    profile.setAvatarUrl(activeProf.avatar_url ?? null);
  };

  const applyProfiles = (profilesToApply: Profile[]) => {
    const sortedProfiles = sortProfilesByName(profilesToApply);
    profile.setProfiles(sortedProfiles);
    return sortedProfiles;
  };

  const refreshProfileSnapshot = async () => {
    const snapshot = await commands.getProfileSnapshot();
    const activeProf = snapshot.activeProfile;

    applyActiveProfile(activeProf);

    return {
      activeProf,
      profiles: applyProfiles(snapshot.profiles),
    };
  };

  const hydrateAvatar = async (candidate: Profile) => {
    if (candidate.avatar_base64 || !candidate.avatar_url) {
      return false;
    }

    if (avatarHydrationInFlightRef.current.has(candidate.id)) {
      return false;
    }

    avatarHydrationInFlightRef.current.add(candidate.id);

    try {
      const latestProfile = await commands.getProfile(candidate.id);
      const targetProfile = latestProfile ?? candidate;

      if (targetProfile.avatar_base64 || !targetProfile.avatar_url) {
        return false;
      }

      const avatarBase64 = await commands.hydrateAvatar(
        targetProfile.avatar_url,
        targetProfile.id,
      );

      if (!avatarBase64) {
        return false;
      }

      console.log("[Auth] Avatar hydrated successfully.");

      try {
        await refreshProfileSnapshot();
      } catch (refreshError) {
        console.error(
          `[useSystemSync] Avatar hydrated for ${candidate.id}, but refreshing profile state failed:`,
          refreshError,
        );
      }

      return true;
    } catch (error) {
      console.error(
        `[useSystemSync] Failed to hydrate avatar for ${candidate.id}:`,
        error,
      );
      return false;
    } finally {
      avatarHydrationInFlightRef.current.delete(candidate.id);
    }
  };

  const hydrateMissingAvatars = (profilesToCheck: Profile[]) => {
    const missingProfiles = profilesToCheck.filter(
      (candidate) => !candidate.avatar_base64 && candidate.avatar_url,
    );

    if (missingProfiles.length === 0) return;

    void Promise.allSettled(
      missingProfiles.map((candidate) => hydrateAvatar(candidate)),
    );
  };

  const checkAndHydrateActiveAvatar = (activeProf: Profile | null) => {
    if (!activeProf) {
      console.log("[Auth] Avatar check skipped: no active profile");
      return;
    }

    if (activeProf.avatar_base64) {
      console.log("[Auth] Avatar check: FOUND");
      return;
    }

    if (!activeProf.avatar_url) {
      console.log("[Auth] Avatar check: NOT_FOUND and no avatar URL available");
      return;
    }

    console.log("[Auth] Avatar check: NOT_FOUND. Starting hydration...");
    void hydrateAvatar(activeProf);
  };

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
      await handleSetWizardState({
        ...state.wizardState,
        step: 1,
        isFinished: true,
      });
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


      const loadedPrefs = await loadPreferences();
      if (cancelled) return;

      console.log("[useSystemSync] Loaded prefs:", loadedPrefs);

      prefs.hydratePreferences(loadedPrefs, {
        defaultModel: appConstants.defaultModel,
        defaultCaptureType: appConstants.defaultCaptureType as
          | "traditional"
          | "squiggle",
        defaultOcrLanguage: appConstants.defaultOcrLanguage,
      });

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
      const snapshot = await commands.getProfileSnapshot();
      const activeProf = snapshot.activeProfile;
      applyActiveProfile(activeProf);
      checkAndHydrateActiveAvatar(activeProf);

      if (!activeProf) {
        console.log("[useSystemSync] No active profile found");
        clearApiKeys();
      } else {
        await loadApiKeys(activeProf.id);
      }

      const sortedProfiles = applyProfiles(snapshot.profiles);
      hydrateMissingAvatars(sortedProfiles);
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
      state.setSessionThreadTitle(null);
      clearApiKeys();
      profile.setActiveProfile(null);
      profile.setUserName("");
      profile.setUserEmail("");
      profile.setAvatarSrc("");
      profile.setAvatarUrl(null);

      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        await loadProfileData();
      } catch (e) {
        console.error("Failed to load profile data after auth:", e);
      }

      profile.setSwitchingProfileId(null);

      if (data && data.id) {
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
      applyActiveProfile(null);
      clearApiKeys();
      state.setStartupImage(null);
      state.setSessionThreadTitle(null);
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
    state.setSessionThreadTitle(null);
    prefs.setSessionOcrLanguage(
      prefs.ocrEnabled ? resolveOcrModelId(prefs.startupOcrLanguage) : "",
    );
  };

  return {
    switchingProfileId: profile.switchingProfileId,
    apiKey,
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
    avatarUrl: profile.avatarUrl,
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
    sessionThreadTitle: state.sessionThreadTitle,
    setSessionThreadTitle: state.setSessionThreadTitle,
    resetSession,
    autoExpandOCR: prefs.autoExpandOCR,
    ocrEnabled: prefs.ocrEnabled,
    captureType: prefs.captureType,
    startupOcrLanguage: prefs.startupOcrLanguage,
    sessionOcrLanguage: prefs.sessionOcrLanguage,
    setSessionOcrLanguage: prefs.setSessionOcrLanguage,
    imgbbKey,
    setImgbbKey,
    handleSetAPIKey: saveApiKey,
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
