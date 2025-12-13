/**
 * @license
 * copyright 2025 a7mddra
 * spdx-license-identifier: apache-2.0
 */

/// <reference types="vite/client" />

interface ElectronAPI {
  // Window & System
  closeWindow: () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  setMainViewBounds: (rect: { x: number; y: number; width: number; height: number }) => void;
  hideMainView: () => void;
  openFileDialog: () => Promise<string>;
  openExternalUrl: (url: string) => void;

  // Theme & Settings
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  onThemeChanged: (callback: (theme: string) => void) => void;
  themeApplied: () => void;
  toggleSettings: () => void;
  onToggleSettings: (callback: () => void) => void;

  // Auth
  startAuth: () => void;
  logout: () => void;
  checkAuthStatus: () => Promise<boolean>;
  onAuthResult: (callback: (data: any) => void) => void;
  byokLogin: () => void;
  resetAPIKey: () => Promise<boolean>;

  // Data
  getUserData: () => Promise<any>;
  getSessionPath: () => Promise<string>;
  checkFileExists: (fileName: string) => Promise<boolean>;
  clearCache: () => void;
  showUnsavedChangesAlert: () => Promise<"save" | "dont-save" | "cancel">;

  // Images
  onImagePath: (callback: (path: string) => void) => void;
  readImageFile: (path: string) => Promise<{ base64: string; mimeType: string } | null>;
  
  // AI
  getPrompt: () => Promise<string>;
  savePrompt: (prompt: string) => Promise<void>;
  resetPrompt: () => Promise<string>;
  getModel: () => Promise<string>;
  saveModel: (model: string) => Promise<void>;
  resetModel: () => Promise<string>;
  getApiKey: () => Promise<string>;
  triggerLensSearch: () => Promise<void>;
  onShowFeedbackFromMain: (callback: (data: { message: string; type: string }) => void) => void;
}

interface Window {
  ipc: ElectronAPI;      // React
  electron: ElectronAPI; // Vanilla
}
