/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { getModelDiscoverySnapshot } from "./models-cache";

export const MODEL_IDS = {
  PRIMARY_FAST: "models/gemini-flash-latest",
  PRIMARY_REASONING: "models/gemini-pro-latest",
} as const;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];
export type ModelEffort = "low" | "medium" | "high";

export interface ModelSelection {
  modelId: typeof MODEL_IDS.PRIMARY_FAST | typeof MODEL_IDS.PRIMARY_REASONING;
  effort: ModelEffort;
}

export type ModelTask = "main" | "micro";
export type ModelAttemptPlan = readonly string[];

export const FLASH_LITE_LATEST_MODEL_ID =
  "models/gemini-flash-lite-latest" as const;

export const MODELS = [
  { id: MODEL_IDS.PRIMARY_FAST, name: "Flash", provider: "gemini" },
  { id: MODEL_IDS.PRIMARY_REASONING, name: "Pro", provider: "gemini" },
] as const;

export const MODEL_EFFORTS = ["low", "medium", "high"] as const;
export const DEFAULT_MODEL_ID: ModelId = MODEL_IDS.PRIMARY_FAST;
export const DEFAULT_MODEL_EFFORT: ModelEffort = "low";
export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  modelId: DEFAULT_MODEL_ID,
  effort: DEFAULT_MODEL_EFFORT,
};

export const isSupportedModelId = (modelId?: string | null): modelId is ModelId =>
  modelId === MODEL_IDS.PRIMARY_FAST || modelId === MODEL_IDS.PRIMARY_REASONING;

export const resolveModelId = (
  modelId?: string | null,
  fallback: ModelId = DEFAULT_MODEL_ID,
): ModelId => (isSupportedModelId(modelId) ? modelId : fallback);

export const isModelEffort = (
  effort?: string | null,
): effort is ModelEffort => MODEL_EFFORTS.some((value) => value === effort);

export const resolveModelEffort = (
  effort?: string | null,
  fallback: ModelEffort = DEFAULT_MODEL_EFFORT,
): ModelEffort => (isModelEffort(effort) ? effort : fallback);

const dedupe = (models: readonly string[]): ModelAttemptPlan => [
  ...new Set(models),
];

/** Build and snapshot the ordered candidates for one provider request. */
export const buildModelAttemptPlan = (
  selection: ModelSelection,
  task: ModelTask,
): ModelAttemptPlan => {
  const discovered = getModelDiscoverySnapshot();
  const stableFlash = discovered.flash;
  const stableLite = discovered.lite;
  const isFlash = selection.modelId === MODEL_IDS.PRIMARY_FAST;

  if (task === "micro") {
    if (
      selection.effort === "low" ||
      (isFlash && selection.effort === "medium")
    ) {
      return dedupe(stableLite);
    }

    if (isFlash) {
      return dedupe([FLASH_LITE_LATEST_MODEL_ID, ...stableLite]);
    }

    return dedupe([
      MODEL_IDS.PRIMARY_FAST,
      FLASH_LITE_LATEST_MODEL_ID,
      ...stableLite,
    ]);
  }

  if (isFlash) {
    if (selection.effort === "low") {
      return dedupe(stableLite);
    }
    if (selection.effort === "medium") {
      return dedupe([...stableFlash, ...stableLite]);
    }
    return dedupe([
      MODEL_IDS.PRIMARY_FAST,
      FLASH_LITE_LATEST_MODEL_ID,
      ...stableLite,
    ]);
  }

  if (selection.effort === "low") {
    return dedupe([...stableFlash, ...stableLite]);
  }
  if (selection.effort === "medium") {
    return dedupe([
      MODEL_IDS.PRIMARY_REASONING,
      MODEL_IDS.PRIMARY_FAST,
      ...stableLite,
    ]);
  }
  return dedupe([
    MODEL_IDS.PRIMARY_REASONING,
    MODEL_IDS.PRIMARY_FAST,
    FLASH_LITE_LATEST_MODEL_ID,
    ...stableLite,
  ]);
};

export const DEFAULT_OCR_MODEL_ID = "pp-ocr-v5-en";

export const SUPPORTED_OCR_MODEL_IDS = [
  "pp-ocr-v5-en",
  "pp-ocr-v5-latin",
  "pp-ocr-v5-cyrillic",
  "pp-ocr-v5-korean",
  "pp-ocr-v5-cjk",
  "pp-ocr-v5-devanagari",
] as const;

const SUPPORTED_OCR_MODEL_ID_SET = new Set<string>(SUPPORTED_OCR_MODEL_IDS);

export const isSupportedOcrModelId = (modelId?: string | null): boolean => {
  if (!modelId) return false;
  return SUPPORTED_OCR_MODEL_ID_SET.has(modelId);
};

export const resolveOcrModelId = (
  modelId?: string | null,
  fallback: string = DEFAULT_OCR_MODEL_ID,
): string => {
  if (modelId && isSupportedOcrModelId(modelId)) {
    return modelId;
  }
  if (fallback === "") {
    return "";
  }
  return isSupportedOcrModelId(fallback) ? fallback : DEFAULT_OCR_MODEL_ID;
};
