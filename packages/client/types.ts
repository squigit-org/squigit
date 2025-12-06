/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Message {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  image?: string;
  timestamp: number;
}

export interface AppConfig {
  google_gemini: {
    api_key: string;
    api_endpoint: string;
    project_name: string;
    project_number: string;
  };
}

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
