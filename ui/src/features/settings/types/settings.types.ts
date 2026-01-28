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
    description:
      "Google's most capable model. Excels at complex multi-step reasoning, advanced code generation, long-context understanding, and nuanced creative writing. Ideal for demanding analytical tasks.",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-flash")!,
    description:
      "A well-balanced model optimized for speed without sacrificing quality. Perfect for everyday tasks including quick code edits, summarization, and conversational AI interactions.",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest")!,
    description:
      "Ultra-fast and lightweight model designed for instant responses. Best suited for simple queries, rapid prototyping, and scenarios where response speed is critical.",
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
    description:
      "High-accuracy on-device OCR engine optimized for English text recognition. Features advanced line detection and character recognition for documents, screenshots, and natural images.",
    isDownloaded: true,
    lang: "en",
  },
  {
    name: "PP-OCRv4 (Chinese)",
    description:
      "Powerful on-device OCR model for Simplified and Traditional Chinese characters. Supports mixed Chinese-English text with intelligent text direction detection.",
    isDownloaded: false,
    lang: "ch",
  },
  {
    name: "PP-OCRv4 (French)",
    description:
      "On-device OCR optimized for French language with full support for accented characters, diacritics, and French-specific punctuation rules.",
    isDownloaded: false,
    lang: "fr",
  },
  {
    name: "PP-OCRv4 (German)",
    description:
      "On-device OCR engine tailored for German text recognition including umlauts, eszett (ß), and compound word handling.",
    isDownloaded: false,
    lang: "de",
  },
  {
    name: "PP-OCRv4 (Korean)",
    description:
      "On-device OCR model for Korean Hangul character recognition with support for mixed Korean-English content and vertical text layouts.",
    isDownloaded: false,
    lang: "ko",
  },
  {
    name: "PP-OCRv4 (Japanese)",
    description:
      "On-device OCR engine supporting Hiragana, Katakana, and Kanji recognition with intelligent handling of vertical and horizontal text.",
    isDownloaded: false,
    lang: "jp",
  },
];