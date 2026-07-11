/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

export interface ImageResponse {
  base64: string;
  mimeType: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_base64: string | null;
  avatar_url?: string | null;
}

export interface AppConstants {

  defaultModel: string;
  defaultTheme: string;
  defaultPrompt: string;
  preferencesFileName: string;
  defaultCaptureType: string;
  defaultOcrLanguage: string;
  defaultActiveAccount: string;
}
