/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { MODELS } from "../../../lib/config/models";

export const MAILTO =
  "mailto:a7mddra@gmail.com?subject=This%20is%20a%20bug%20report%20from%20Spatialshot&body=Please%20describe%20the%20bug%20below:%0A%0A";
export const GITHUB = "https://github.com/a7mddra/spatialshot";

export const modelsWithInfo = [
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-pro")!,
    description: "Strongest - Complex reasoning",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-flash")!,
    description: "Balanced - Fast & versatile",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest")!,
    description: "Fastest - Quick tasks",
  },
];

export interface OCRModel {
  name: string;
  description: string;
  isDownloaded: boolean;
  lang: string;
}

export const ocrModels: OCRModel[] = [
  {
    name: "PP-OCRv4 (English)",
    description: "High accuracy on-device OCR",
    isDownloaded: true,
    lang: "en",
  },
  {
    name: "PP-OCRv4 (Chinese)",
    description: "Standard accuracy on-device OCR",
    isDownloaded: false,
    lang: "ch",
  },
  {
    name: "PP-OCRv4 (French)",
    description: "Standard accuracy on-device OCR",
    isDownloaded: false,
    lang: "fr",
  },
  {
    name: "PP-OCRv4 (German)",
    description: "Standard accuracy on-device OCR",
    isDownloaded: false,
    lang: "de",
  },
  {
    name: "PP-OCRv4 (Korean)",
    description: "Standard accuracy on-device OCR",
    isDownloaded: false,
    lang: "ko",
  },
  {
    name: "PP-OCRv4 (Japanese)",
    description: "Standard accuracy on-device OCR",
    isDownloaded: false,
    lang: "jp",
  },
];
