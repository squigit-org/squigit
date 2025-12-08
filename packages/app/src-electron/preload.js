/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // ===================================================
  //  Window & System Controls
  // ===================================================
  closeWindow: () => ipcRenderer.send("close-window"),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  setMainViewBounds: (rect) => ipcRenderer.send("set-main-view-bounds", rect),
  hideMainView: () => ipcRenderer.send("hide-main-view"),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  // External Links
  openExternal: (url) => ipcRenderer.send("open-external", url),

  // ===================================================
  //  Theme & Settings
  // ===================================================
  setTheme: (theme) => ipcRenderer.send("set-theme", theme),
  toggleTheme: () => ipcRenderer.send("toggle-theme"),
  onThemeChanged: (callback) =>
    ipcRenderer.on("set-theme", (_, theme) => callback(theme)),
  themeApplied: () => ipcRenderer.send("theme-applied"),

  // Settings UI
  toggleSettings: () => ipcRenderer.send("toggle-settings"),
  onToggleSettings: (callback) =>
    ipcRenderer.on("toggle-settings", () => callback()),

  // ===================================================
  //  Auth & Session
  // ===================================================
  startAuth: () => ipcRenderer.send("start-auth"),
  logout: () => ipcRenderer.send("logout"),
  checkAuthStatus: () => ipcRenderer.invoke("check-auth-status"),
  onAuthResult: (callback) =>
    ipcRenderer.on("auth-result", (_, data) => callback(data)),
  byokLogin: () => ipcRenderer.send("byok-login"),
  resetAPIKey: () => ipcRenderer.invoke("reset-api-key"),

  // ===================================================
  //  Data & File System
  // ===================================================
  getUserData: () => ipcRenderer.invoke("get-user-data"),
  getSessionPath: () => ipcRenderer.invoke("get-session-path"),
  checkFileExists: (fileName) =>
    ipcRenderer.invoke("check-file-exists", fileName),
  clearCache: () => ipcRenderer.send("clear-cache"),
  showUnsavedChangesAlert: () =>
    ipcRenderer.invoke("show-unsaved-changes-alert"),

  // ===================================================
  //  Image Handling
  // ===================================================
  onImagePath: (callback) =>
    ipcRenderer.on("image-path", (_, path) => callback(path)),
  onImageData: (callback) =>
    ipcRenderer.on("image-data", (_, data) => callback(data)),
  sendImagePath: (path) => ipcRenderer.send("image-path", path),
  readImageFile: (path) => ipcRenderer.invoke("read-image-file", path),

  // ===================================================
  //  AI / Prompts / Models (React Specific)
  // ===================================================
  getPrompt: () => ipcRenderer.invoke("get-prompt"),
  savePrompt: (prompt) => ipcRenderer.invoke("save-prompt", prompt),
  resetPrompt: () => ipcRenderer.invoke("reset-prompt"),
  getModel: () => ipcRenderer.invoke("get-model"),
  saveModel: (model) => ipcRenderer.invoke("save-model", model),
  resetModel: () => ipcRenderer.invoke("reset-model"),
  getApiKey: () => ipcRenderer.invoke("get-api-key"),
  triggerLensSearch: () => ipcRenderer.invoke("trigger-lens-search"),
  onShowFeedbackFromMain: (callback) =>
    ipcRenderer.on("show-feedback-from-main", (_, data) => callback(data)),

  // ===================================================
  //  Clipboard Watcher (BYOK)
  // ===================================================
  startClipboardWatcher: () => ipcRenderer.invoke("start-clipboard-watcher"),
  stopClipboardWatcher: () => ipcRenderer.invoke("stop-clipboard-watcher"),
  onClipboardText: (callback) =>
    ipcRenderer.on("clipboard-text", (_, data) => callback(data)),
  encryptAndSave: (data) => ipcRenderer.invoke("encrypt-and-save", data),
});
