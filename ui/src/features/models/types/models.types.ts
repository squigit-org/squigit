/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: Implement model types
export type ModelType = "ocr";

export interface OcrModelDownloable {
  id: string;
  name: string;
  size: string;
  state: "idle" | "downloading" | "downloaded";
}

export const AVAILABLE_MODELS: OcrModelDownloable[] = [
  { id: "pp-ocr-v4-ru", name: "Russian", size: "12 MB", state: "idle" },
  { id: "pp-ocr-v4-ko", name: "Korean", size: "15 MB", state: "idle" },
  { id: "pp-ocr-v4-ja", name: "Japanese", size: "14 MB", state: "idle" },
  { id: "pp-ocr-v4-es", name: "Spanish", size: "11 MB", state: "idle" },
  { id: "pp-ocr-v4-it", name: "Italian", size: "11 MB", state: "idle" },
  { id: "pp-ocr-v4-pt", name: "Portuguese", size: "11 MB", state: "idle" },
  { id: "pp-ocr-v4-hi", name: "Hindi", size: "18 MB", state: "idle" },
];

export const INSTALLED_MODELS = [{ id: "pp-ocr-v4-en", name: "English" }];

export const LANGUAGE_CODE_MAP: Record<string, string> = {
  English: "en",
  Russian: "ru",
  Korean: "ko",
  Japanese: "ja",
  Spanish: "es",
  Italian: "it",
  Portuguese: "pt",
  Hindi: "hi",
};

export const getLanguageCode = (name: string) => {
  if (!name) return "??";

  // Handle pp-ocr-v4- prefix (case insensitive) and legacy "PP-OCRv4 (Name)" format
  let cleanName = name;
  if (cleanName.toLowerCase().startsWith("pp-ocr-v4-")) {
    cleanName = cleanName.slice(10); // remove pp-ocr-v4-
  } else if (cleanName.startsWith("PP-OCRv4 (")) {
    // "PP-OCRv4 (English)" -> "English"
    cleanName = cleanName.replace("PP-OCRv4 (", "").replace(")", "");
  }

  // If it matches a key in map (e.g. "English"), return code
  if (LANGUAGE_CODE_MAP[cleanName]) {
    return LANGUAGE_CODE_MAP[cleanName].toUpperCase();
  }

  // Otherwise limit to 2 chars (e.g. "ru", "en")
  return cleanName.slice(0, 2).toUpperCase();
};
