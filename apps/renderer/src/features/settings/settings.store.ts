/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from "zustand";
import { commands, platform } from "@/platform";
import { initializeBrainProvider } from "@squigit/core/brain/session";
import {
  DEFAULT_OCR_MODEL_ID,
  DEFAULT_MODEL_EFFORT,
  DEFAULT_PREFERENCES,
  loadPreferences,
  resolveModelId,
  resolveModelEffort,
  resolveOcrModelId,
  savePreferences,
  type UserPreferences,
  type ModelEffort,
  type ModelId,
} from "@squigit/core/config";
import { getConfigPort } from "@squigit/core/ports";

const RULES_FILE_NAME = "RULES.md";
const RULES_SAVE_DELAY_MS = 1000;

type ApiKeyProvider = "google ai studio" | "imgbb";
type ThemePreference = UserPreferences["theme"];
type CaptureType = UserPreferences["captureType"];

type PreferenceDefaults = {
  defaultModel: string;
  defaultCaptureType: CaptureType;
  defaultOcrLanguage: string;
};

interface SettingsState {
  rulesPrompt: string;
  rulesPersistedPrompt: string;
  isRulesLoaded: boolean;
  initRules: () => Promise<void>;
  setRulesPrompt: (prompt: string) => void;
  flushRulesPrompt: () => Promise<boolean>;

  activeProfileId: string | null;
  apiKey: string;
  imgbbKey: string;
  setApiKey: (key: string) => void;
  setImgbbKey: (key: string) => void;
  clearApiKeys: () => void;
  loadApiKeys: (profileId: string | null | undefined) => Promise<void>;
  saveApiKey: (provider: ApiKeyProvider, key: string) => Promise<boolean>;

  preferencesHydrated: boolean;
  startupModel: ModelId;
  editingModel: ModelId;
  sessionModel: ModelId;
  startupEffort: ModelEffort;
  editingEffort: ModelEffort;
  sessionEffort: ModelEffort;
  themePreference: ThemePreference;
  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  captureType: CaptureType;
  startupOcrLanguage: string;
  sessionOcrLanguage: string;
  hydratePreferences: (
    prefs: Partial<UserPreferences>,
    defaults: PreferenceDefaults,
  ) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  setStartupModel: (model: ModelId) => void;
  setEditingModel: (model: ModelId) => void;
  setSessionModel: (model: ModelId) => void;
  setStartupEffort: (effort: ModelEffort) => void;
  setEditingEffort: (effort: ModelEffort) => void;
  setSessionEffort: (effort: ModelEffort) => void;
  setThemePreference: (theme: ThemePreference) => void;
  setAutoExpandOCR: (enabled: boolean) => void;
  setOcrEnabled: (enabled: boolean) => void;
  setCaptureType: (captureType: CaptureType) => void;
  setStartupOcrLanguage: (ocrLanguage: string) => void;
  setSessionOcrLanguage: (ocrLanguage: string) => void;
}

let rulesSaveTimer: ReturnType<typeof setTimeout> | null = null;
let apiKeysLoadId = 0;

async function ensureRulesFileExists() {
  const configPort = getConfigPort();
  const exists = await configPort.hasConfigFile(RULES_FILE_NAME);
  if (!exists) {
    await configPort.writeConfigFile(RULES_FILE_NAME, "");
  }
  return configPort;
}

function clearRulesSaveTimer() {
  if (!rulesSaveTimer) return;
  clearTimeout(rulesSaveTimer);
  rulesSaveTimer = null;
}

function applyPreferenceUpdates(
  state: SettingsState,
  updates: Partial<UserPreferences>,
): Partial<SettingsState> {
  const normalizedUpdatedOcrLanguage =
    updates.ocrLanguage !== undefined
      ? resolveOcrModelId(updates.ocrLanguage)
      : undefined;

  const next: Partial<SettingsState> = {};

  if (updates.model !== undefined) {
    next.startupModel = updates.model;
    next.editingModel = updates.model;
    next.sessionModel = updates.model;
  }

  if (updates.effort !== undefined) {
    const effort = resolveModelEffort(updates.effort);
    next.startupEffort = effort;
    next.editingEffort = effort;
    next.sessionEffort = effort;
  }

  if (updates.theme !== undefined) {
    next.themePreference = updates.theme;
  }

  if (updates.autoExpandOCR !== undefined) {
    next.autoExpandOCR = updates.autoExpandOCR;
  }

  if (updates.ocrEnabled !== undefined) {
    next.ocrEnabled = updates.ocrEnabled;
    next.sessionOcrLanguage = updates.ocrEnabled
      ? normalizedUpdatedOcrLanguage ?? resolveOcrModelId(state.startupOcrLanguage)
      : "";
  }

  if (updates.captureType !== undefined) {
    next.captureType = updates.captureType;
  }

  if (normalizedUpdatedOcrLanguage !== undefined) {
    next.startupOcrLanguage = normalizedUpdatedOcrLanguage;
    if (state.ocrEnabled && updates.ocrEnabled === undefined) {
      next.sessionOcrLanguage = normalizedUpdatedOcrLanguage;
    }
  }

  return next;
}

async function readProfileApiKey(
  provider: ApiKeyProvider,
  profileId: string,
): Promise<string> {
  return platform.invoke<string>("get_api_key", { provider, profileId });
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const persistRulesPrompt = async (prompt: string): Promise<boolean> => {
    try {
      const configPort = await ensureRulesFileExists();
      await configPort.writeConfigFile(RULES_FILE_NAME, prompt);
      set({ rulesPersistedPrompt: prompt });

      if (get().rulesPrompt !== prompt) {
        get().setRulesPrompt(get().rulesPrompt);
      }

      return true;
    } catch (error) {
      console.error("[Settings] Failed to save RULES.md:", error);

      if (get().rulesPrompt === prompt) {
        set({ rulesPrompt: get().rulesPersistedPrompt });
      }

      return false;
    }
  };

  const scheduleRulesSave = (prompt: string) => {
    clearRulesSaveTimer();
    rulesSaveTimer = setTimeout(() => {
      rulesSaveTimer = null;
      void persistRulesPrompt(prompt);
    }, RULES_SAVE_DELAY_MS);
  };

  return {
    rulesPrompt: "",
    rulesPersistedPrompt: "",
    isRulesLoaded: false,

    initRules: async () => {
      try {
        const configPort = await ensureRulesFileExists();
        const prompt = await configPort.readConfigFile(RULES_FILE_NAME);
        set({
          rulesPrompt: prompt,
          rulesPersistedPrompt: prompt,
          isRulesLoaded: true,
        });
      } catch (error) {
        console.error("[Settings] Failed to load RULES.md:", error);
        set({ rulesPrompt: "", rulesPersistedPrompt: "", isRulesLoaded: true });
      }
    },

    setRulesPrompt: (prompt: string) => {
      set({ rulesPrompt: prompt });
      scheduleRulesSave(prompt);
    },

    flushRulesPrompt: async () => {
      clearRulesSaveTimer();
      return persistRulesPrompt(get().rulesPrompt);
    },

    activeProfileId: null,
    apiKey: "",
    imgbbKey: "",

    setApiKey: (key: string) => set({ apiKey: key }),
    setImgbbKey: (key: string) => set({ imgbbKey: key }),

    clearApiKeys: () => {
      apiKeysLoadId += 1;
      set({ activeProfileId: null, apiKey: "", imgbbKey: "" });
    },

    loadApiKeys: async (profileId) => {
      const loadId = ++apiKeysLoadId;

      if (!profileId) {
        set({ activeProfileId: null, apiKey: "", imgbbKey: "" });
        return;
      }

      set({ activeProfileId: profileId, apiKey: "", imgbbKey: "" });

      const [providerResult, imgbbResult] = await Promise.allSettled([
        readProfileApiKey("google ai studio", profileId),
        readProfileApiKey("imgbb", profileId),
      ]);

      if (loadId !== apiKeysLoadId || get().activeProfileId !== profileId) {
        return;
      }

      let nextApiKey = "";
      let nextImgbbKey = "";

      if (providerResult.status === "fulfilled") {
        nextApiKey = providerResult.value || "";
        console.log(
          "[Settings] AI provider key retrieved:",
          nextApiKey ? "FOUND" : "EMPTY",
        );
      } else {
        console.error(
          "[Settings] Failed to retrieve AI provider key:",
          providerResult.reason,
        );
      }

      if (imgbbResult.status === "fulfilled") {
        nextImgbbKey = imgbbResult.value || "";
        console.log(
          "[Settings] ImgBB key retrieved:",
          nextImgbbKey ? "FOUND" : "EMPTY",
        );
      } else {
        console.error(
          "[Settings] Failed to retrieve ImgBB key:",
          imgbbResult.reason,
        );
      }

      set({ apiKey: nextApiKey, imgbbKey: nextImgbbKey });

      if (nextApiKey) {
        initializeBrainProvider(nextApiKey);
      }
    },

    saveApiKey: async (provider, key) => {
      const { activeProfileId } = get();

      if (!activeProfileId) {
        console.error(
          "[Settings] No active profile - cannot save API key.",
        );
        return false;
      }

      try {
        console.log(
          `[Settings] Saving ${provider} key for profile ${activeProfileId}`,
        );
        await commands.setApiKey(provider, key, activeProfileId);

        if (provider === "google ai studio") {
          set({ apiKey: key });
          initializeBrainProvider(key);
        } else {
          set({ imgbbKey: key });
        }

        return true;
      } catch (error) {
        console.error(
          `[Settings] Failed to set ${provider} API key:`,
          error,
        );
        return false;
      }
    },

    preferencesHydrated: false,
    startupModel: DEFAULT_PREFERENCES.model,
    editingModel: DEFAULT_PREFERENCES.model,
    sessionModel: DEFAULT_PREFERENCES.model,
    startupEffort: DEFAULT_MODEL_EFFORT,
    editingEffort: DEFAULT_MODEL_EFFORT,
    sessionEffort: DEFAULT_MODEL_EFFORT,
    themePreference: "system",
    autoExpandOCR: true,
    ocrEnabled: true,
    captureType: "traditional",
    startupOcrLanguage: DEFAULT_OCR_MODEL_ID,
    sessionOcrLanguage: DEFAULT_OCR_MODEL_ID,

    hydratePreferences: (prefs, defaults) => {
      const loadedModel = resolveModelId(
        prefs.model,
        resolveModelId(defaults.defaultModel),
      );
      const loadedOcrLanguage = resolveOcrModelId(
        prefs.ocrLanguage,
        defaults.defaultOcrLanguage,
      );
      const ocrEnabled =
        prefs.ocrEnabled !== undefined ? prefs.ocrEnabled : true;
      const themePreference = prefs.theme || "system";
      const loadedEffort = resolveModelEffort(prefs.effort);

      set({
        preferencesHydrated: true,
        startupModel: loadedModel,
        editingModel: loadedModel,
        sessionModel: loadedModel,
        startupEffort: loadedEffort,
        editingEffort: loadedEffort,
        sessionEffort: loadedEffort,
        themePreference,
        ocrEnabled,
        autoExpandOCR:
          prefs.autoExpandOCR !== undefined ? prefs.autoExpandOCR : true,
        captureType: prefs.captureType || defaults.defaultCaptureType,
        startupOcrLanguage: loadedOcrLanguage,
        sessionOcrLanguage: ocrEnabled ? loadedOcrLanguage : "",
      });
    },

    updatePreferences: async (updates) => {
      const normalizedUpdates =
        updates.ocrLanguage !== undefined
          ? { ...updates, ocrLanguage: resolveOcrModelId(updates.ocrLanguage) }
          : updates;

      set((state) => ({
        ...applyPreferenceUpdates(state, normalizedUpdates),
        preferencesHydrated: true,
      }));

      try {
        const currentPrefs = await loadPreferences();
        await savePreferences({ ...currentPrefs, ...normalizedUpdates });
      } catch (error) {
        console.error("[Settings] Failed to save preferences:", error);
      }
    },

    setStartupModel: (model) => set({ startupModel: model }),
    setEditingModel: (model) => set({ editingModel: model }),
    setSessionModel: (model) => set({ sessionModel: model }),
    setStartupEffort: (effort) => set({ startupEffort: effort }),
    setEditingEffort: (effort) => set({ editingEffort: effort }),
    setSessionEffort: (effort) => set({ sessionEffort: effort }),
    setThemePreference: (theme) => set({ themePreference: theme }),
    setAutoExpandOCR: (enabled) => set({ autoExpandOCR: enabled }),
    setOcrEnabled: (enabled) =>
      set((state) => ({
        ocrEnabled: enabled,
        sessionOcrLanguage: enabled
          ? resolveOcrModelId(state.startupOcrLanguage)
          : "",
      })),
    setCaptureType: (captureType) => set({ captureType }),
    setStartupOcrLanguage: (ocrLanguage) =>
      set({ startupOcrLanguage: resolveOcrModelId(ocrLanguage) }),
    setSessionOcrLanguage: (ocrLanguage) =>
      set({ sessionOcrLanguage: resolveOcrModelId(ocrLanguage, "") }),
  };
});
