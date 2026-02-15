/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { OcrModelStatus, AVAILABLE_MODELS } from "../types";
import { getInstalledModelIds } from "../services";
import { downloadModel } from "../services/modelDownloader";

export const useModels = () => {
  const [models, setModels] = useState<OcrModelStatus[]>(() =>
    AVAILABLE_MODELS.map((m) => ({ ...m, state: "idle" })),
  );
  const [isLoading, setIsLoading] = useState(true);

  const refreshModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const installedIds = await getInstalledModelIds();
      setModels((prevModels) =>
        prevModels.map((model) => {
          const isInstalled = installedIds.includes(model.id);
          if (isInstalled) {
            return { ...model, state: "downloaded" };
          }
          return model.state === "downloading"
            ? model
            : { ...model, state: "idle" };
        }),
      );
    } catch (error) {
      console.error("Failed to refresh model list:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setModels((prev) =>
      prev.map((m) =>
        m.id === "pp-ocr-v4-en" ? { ...m, state: "downloaded" } : m,
      ),
    );
    refreshModels();
  }, [refreshModels]);

  const startDownload = useCallback(
    async (modelId: string) => {
      const modelToDownload = models.find((m) => m.id === modelId);
      if (!modelToDownload || modelToDownload.state !== "idle") return;

      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, state: "downloading" } : m,
        ),
      );

      try {
        await downloadModel(modelToDownload);
        setModels((prev) =>
          prev.map((m) =>
            m.id === modelId ? { ...m, state: "downloaded" } : m,
          ),
        );
      } catch (error) {
        console.error(`Download failed for ${modelId}:`, error);
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, state: "idle" } : m)),
        );
        throw error;
      }
    },
    [models],
  );

  return { models, isLoading, refreshModels, startDownload };
};
