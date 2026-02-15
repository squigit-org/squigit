/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from "zustand";
import { OcrModelStatus, AVAILABLE_MODELS } from "../types";
import { getInstalledModelIds } from "../services";
import { downloadModel } from "../services/modelDownloader";

export interface ModelsState {
  models: OcrModelStatus[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  startDownload: (modelId: string) => Promise<void>;
  installedModels: () => OcrModelStatus[];
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: AVAILABLE_MODELS.map((m) => ({
    ...m,
    state: m.id === "pp-ocr-v4-en" ? "downloaded" : "idle",
  })),
  isLoading: true,

  installedModels: () => get().models.filter((m) => m.state === "downloaded"),

  refresh: async () => {
    set({ isLoading: true });
    try {
      const installedIds = await getInstalledModelIds();

      if (!installedIds.includes("pp-ocr-v4-en")) {
        installedIds.push("pp-ocr-v4-en");
      }

      set((state) => ({
        models: state.models.map((model) => {
          const isInstalled = installedIds.includes(model.id);
          if (isInstalled) {
            return { ...model, state: "downloaded" };
          }

          return model.state === "downloading"
            ? model
            : { ...model, state: "idle" };
        }),
        isLoading: false,
      }));
    } catch (error) {
      console.error("Failed to refresh model list:", error);
      set({ isLoading: false });
    }
  },

  startDownload: async (modelId: string) => {
    const modelToDownload = get().models.find((m) => m.id === modelId);
    if (!modelToDownload || modelToDownload.state !== "idle") return;

    set((state) => ({
      models: state.models.map((m) =>
        m.id === modelId ? { ...m, state: "downloading" } : m,
      ),
    }));

    try {
      await downloadModel(modelToDownload);

      await get().refresh();
    } catch (error) {
      console.error(`Download failed for ${modelId}:`, error);

      set((state) => ({
        models: state.models.map((m) =>
          m.id === modelId ? { ...m, state: "idle" } : m,
        ),
      }));
      throw error;
    }
  },
}));

useModelsStore.getState().refresh();
