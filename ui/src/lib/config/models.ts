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
