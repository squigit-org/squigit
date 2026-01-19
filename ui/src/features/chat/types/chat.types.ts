/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Message {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  image?: string;
  timestamp: number;
}

export enum ModelType {
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  GEMINI_FLASH_LITE = "gemini-flash-lite-latest",
  GEMINI_2_5_PRO = "gemini-2.5-pro",
}

export interface AppConfig {
  google_gemini: {
    api_key: string;
    api_endpoint: string;
    project_name: string;
    project_number: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  streamingText: string;
  firstResponseId: string | null;
  createdAt: number;
  type: "default" | "edit" | "settings";
  imageData: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  lensUrl: string | null;
  inputText: string;
  isLoading?: boolean;
  error?: string | null;
  ocrData?: { text: string; box: number[][] }[];
}
