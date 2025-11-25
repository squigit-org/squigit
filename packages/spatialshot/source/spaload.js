/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ipc", {
  // ---- Image handling ----
  onImagePath: (callback) =>
    ipcRenderer.on("image-path", (_, imagePath) => callback(imagePath)),
  readImageFile: (path) => ipcRenderer.invoke("read-image-file", path),

  // ---- Session / user data ----
  getSessionPath: () => ipcRenderer.invoke("get-session-path"),
  getUserData: () => ipcRenderer.invoke("get-user-data"),

  // ---- Prompt / API key ----
  getPrompt: () => ipcRenderer.invoke("get-prompt"),
  savePrompt: (prompt) => ipcRenderer.invoke("save-prompt", prompt),
  resetPrompt: () => ipcRenderer.invoke("reset-prompt"),
  getApiKey: () => ipcRenderer.invoke("get-api-key"),

  // ---- UI events ----
  onToggleSettings: (callback) =>
    ipcRenderer.on("toggle-settings", () => callback()),

  onShowFeedbackFromMain: (callback) =>
    ipcRenderer.on("show-feedback-from-main", (_, data) => callback(data)),

  // ---- Theme ----
  setTheme: (theme) => ipcRenderer.send("set-theme", theme),
  onThemeChanged: (callback) =>
    ipcRenderer.on("set-theme", (_, theme) => callback(theme)),

  // ---- System ----
  logout: () => ipcRenderer.send("logout"),
  resetAPIKey: () => ipcRenderer.invoke("reset-api-key"),
  clearCache: () => ipcRenderer.send("clear-cache"),
  openExternalUrl: (url) => ipcRenderer.send("open-external-url", url),
  showUnsavedChangesAlert: () =>
    ipcRenderer.invoke("show-unsaved-changes-alert"),
  triggerLensSearch: () => ipcRenderer.invoke("trigger-lens-search"),
});
