/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_MODEL_ID, DEFAULT_OCR_MODEL_ID } from "./models-config";

export const APP_NAME = "Squigit";
export const DEFAULT_THEME = "system" as const;
export const DEFAULT_PROMPT =
  "Analyze this image and explain it or discuss fixes about the issue it describes.";
export const PREFERENCES_FILE_NAME = "preferences.json";
export const DEFAULT_CAPTURE_TYPE = "rectangular" as const;

export const DEFAULT_PREFERENCES = {
  model: DEFAULT_MODEL_ID,
  theme: DEFAULT_THEME,
  prompt: DEFAULT_PROMPT,
  ocrEnabled: true,
  autoExpandOCR: true,
  captureType: DEFAULT_CAPTURE_TYPE,
  ocrLanguage: DEFAULT_OCR_MODEL_ID,
} as const;
