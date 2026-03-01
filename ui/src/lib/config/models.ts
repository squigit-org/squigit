/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

export enum ModelType {
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  GEMINI_FLASH_LITE = "gemini-flash-lite-latest",
  GEMINI_2_5_PRO = "gemini-2.5-pro",
}

export const MODELS = [
  { id: ModelType.GEMINI_2_5_FLASH, name: "Gemini 2.5 Flash" },
  { id: ModelType.GEMINI_FLASH_LITE, name: "Gemini Flash Lite" },
  { id: ModelType.GEMINI_2_5_PRO, name: "Gemini 2.5 Pro" },
];

export const DEFAULT_OCR_MODEL_ID = "pp-ocr-v5-en";

export const LEGACY_OCR_MODEL_ID_MAP: Record<string, string> = {
  "pp-ocr-v4-en": "pp-ocr-v5-en",
  "pp-ocr-v4-ru": "pp-ocr-v5-cyrillic",
  "pp-ocr-v4-ko": "pp-ocr-v5-korean",
  "pp-ocr-v4-ja": "pp-ocr-v5-cjk",
  "pp-ocr-v4-zh": "pp-ocr-v5-cjk",
  "pp-ocr-v4-es": "pp-ocr-v5-latin",
  "pp-ocr-v4-it": "pp-ocr-v5-latin",
  "pp-ocr-v4-pt": "pp-ocr-v5-latin",
  "pp-ocr-v4-hi": "pp-ocr-v5-devanagari",
};

export const migrateOcrModelId = (
  modelId?: string | null,
): string | undefined => {
  if (!modelId) return undefined;
  return LEGACY_OCR_MODEL_ID_MAP[modelId] || modelId;
};
