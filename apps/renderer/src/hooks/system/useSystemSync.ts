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

const AVATAR_RECOVERY_RETRY_MS = 60_000;

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
  const avatarRecoveryTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const avatarRecoveryInFlightRef = useRef(new Set<string>());

  const clearAvatarRecoveryTimer = (profileId: string) => {
    const timer = avatarRecoveryTimersRef.current.get(profileId);
    if (!timer) return;

    clearTimeout(timer);
    avatarRecoveryTimersRef.current.delete(profileId);
  };

  const clearAllAvatarRecoveryTimers = () => {
    avatarRecoveryTimersRef.current.forEach((timer) => clearTimeout(timer));
    avatarRecoveryTimersRef.current.clear();
  };

  useEffect(() => () => clearAllAvatarRecoveryTimers(), []);

  const applyActiveProfile = (activeProf: Profile | null) => {
    profile.setActiveProfile(activeProf);

    if (!activeProf) {
      profile.setUserName("");
      profile.setUserEmail("");
      profile.setAvatarSrc("");
      profile.setOriginalPicture(null);
      return;
    }

    profile.setUserName(activeProf.name);
    profile.setUserEmail(activeProf.email);
    profile.setAvatarSrc(activeProf.avatar || "");
    profile.setOriginalPicture(activeProf.original_avatar ?? null);
  };

  const applyProfiles = (profilesToApply: Profile[]) => {
    const sortedProfiles = sortProfilesByName(profilesToApply);
    profile.setProfiles(sortedProfiles);
    return sortedProfiles;
  };

  const refreshProfileSnapshot = async () => {
    const [activeProf, allProfiles] = await Promise.all([
      commands.getActiveProfile(),
      commands.listProfiles(),
    ]);

    applyActiveProfile(activeProf);

    return {
      activeProf,
      profiles: applyProfiles(allProfiles),
    };
  };

  const scheduleAvatarRecovery = (candidate: Profile) => {
    if (candidate.avatar || !candidate.original_avatar) return;
    if (avatarRecoveryInFlightRef.current.has(candidate.id)) return;
    if (avatarRecoveryTimersRef.current.has(candidate.id)) return;

    console.log("[Auth] Avatar recovery failed. Retrying in 60s...");
    const timer = setTimeout(() => {
      avatarRecoveryTimersRef.current.delete(candidate.id);
      void recoverAvatar(candidate);
    }, AVATAR_RECOVERY_RETRY_MS);

    avatarRecoveryTimersRef.current.set(candidate.id, timer);
  };

  const recoverAvatar = async (candidate: Profile) => {
    if (candidate.avatar || !candidate.original_avatar) {
      clearAvatarRecoveryTimer(candidate.id);
      return false;
    }

    if (avatarRecoveryInFlightRef.current.has(candidate.id)) {
      return false;
    }

    if (avatarRecoveryTimersRef.current.has(candidate.id)) {
      return false;
    }

    avatarRecoveryInFlightRef.current.add(candidate.id);

    try {
      const latestProfile = await commands.getProfile(candidate.id);
      const targetProfile = latestProfile ?? candidate;

      if (targetProfile.avatar || !targetProfile.original_avatar) {
        clearAvatarRecoveryTimer(candidate.id);
        return false;
      }

      const localPath = await commands.cacheAvatar(
        targetProfile.original_avatar,
        targetProfile.id,
      );

      if (!localPath) {
        scheduleAvatarRecovery(candidate);
        return false;
      }

      console.log("[Auth] Avatar recovered successfully.");
      clearAvatarRecoveryTimer(candidate.id);

      try {
        await refreshProfileSnapshot();
      } catch (refreshError) {
        console.error(
          `[useSystemSync] Avatar recovered for ${candidate.id}, but refreshing profile state failed:`,
          refreshError,
        );
      }

      return true;
    } catch (error) {
      console.error(
        `[useSystemSync] Failed to recover avatar for ${candidate.id}:`,
        error,
      );
      scheduleAvatarRecovery(candidate);
      return false;
    } finally {
      avatarRecoveryInFlightRef.current.delete(candidate.id);
    }
  };

  const recoverMissingAvatars = (profilesToCheck: Profile[]) => {
    const missingProfiles = profilesToCheck.filter(
      (candidate) => !candidate.avatar && candidate.original_avatar,
    );

    if (missingProfiles.length === 0) return;

    void Promise.allSettled(
      missingProfiles.map((candidate) => recoverAvatar(candidate)),
    );
  };

  const checkAndHealActiveAvatar = (activeProf: Profile | null) => {
    if (!activeProf) {
      console.log("[Auth] Avatar check skipped: no active profile");
      return;
    }

    if (activeProf.avatar) {
      console.log("[Auth] Avatar check: FOUND");
      return;
    }

    if (!activeProf.original_avatar) {
      console.log("[Auth] Avatar check: NOT_FOUND and no original avatar available");
      return;
    }

    console.log("[Auth] Avatar check: NOT_FOUND. Starting recovery...");
    void recoverAvatar(activeProf);
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
      const activeProf = await commands.getActiveProfile();
      applyActiveProfile(activeProf);
      checkAndHealActiveAvatar(activeProf);

      if (!activeProf) {
        console.log("No active profile found");
        clearApiKeys();
      } else {
        await loadApiKeys(activeProf.id);
      }

      const allProfiles = await commands.listProfiles();
      const sortedProfiles = applyProfiles(allProfiles);
      recoverMissingAvatars(sortedProfiles);
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
      profile.setOriginalPicture(null);

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
