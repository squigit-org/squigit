/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

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

export * from "./components/ModelSwitcher/ModelSwitcher";
