/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_MODEL_ID, DEFAULT_OCR_MODEL_ID } from "./models-config";

export const DEFAULT_THEME = "system" as const;
export const CONFIG_FILE_NAME = "config.toml";
export const DEFAULT_CAPTURE_TYPE = "traditional" as const;

export const DEFAULT_PREFERENCES = {
  model: DEFAULT_MODEL_ID,
  theme: DEFAULT_THEME,
  ocrEnabled: true,
  autoExpandOCR: true,
  captureType: DEFAULT_CAPTURE_TYPE,
  ocrLanguage: DEFAULT_OCR_MODEL_ID,
} as const;
