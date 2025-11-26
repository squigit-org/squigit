/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { contextBridge, ipcRenderer } = require("electron");

// ===================================================
//  Electron (main bridge)
// ===================================================
contextBridge.exposeInMainWorld("electron", {
  // ---- Theme ----
  onThemeChanged: (callback) =>
    ipcRenderer.on("set-theme", (_, theme) => callback(theme)),
  themeApplied: () => ipcRenderer.send("theme-applied"),
  toggleSettings: () => ipcRenderer.send("toggle-settings"),

  // ---- Image handling ----
  onImagePath: (callback) =>
    ipcRenderer.on("image-path", (_, path) => callback(path)),
  onImageData: (callback) =>
    ipcRenderer.on("image-data", (_, data) => callback(data)),
  sendImagePath: (path) => ipcRenderer.send("image-path", path),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  // ---- Window controls ----
  closeWindow: () => ipcRenderer.send("close-window"),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  setMainViewBounds: (rect) => ipcRenderer.send("set-main-view-bounds", rect),
  hideMainView: () => ipcRenderer.send("hide-main-view"),

  // ---- Auth ----
  startAuth: () => ipcRenderer.send("start-auth"),
  onAuthResult: (callback) =>
    ipcRenderer.on("auth-result", (_, data) => callback(data)),
  checkAuthStatus: () => ipcRenderer.invoke("check-auth-status"),
  byokLogin: () => ipcRenderer.send("byok-login"),
  checkFileExists: (fileName) =>
    ipcRenderer.invoke("check-file-exists", fileName),
  openExternalUrl: (url) => ipcRenderer.send("open-external-url", url),

  // ---- BYOK ----
  startClipboardWatcher: () => ipcRenderer.invoke("start-clipboard-watcher"),
  stopClipboardWatcher: () => ipcRenderer.invoke("stop-clipboard-watcher"),
  onClipboardText: (callback) =>
    ipcRenderer.on("clipboard-text", (_, data) => callback(data)),
  encryptAndSave: (data) =>
    ipcRenderer.invoke("encrypt-and-save", data),
});

// ===================================================
//  Electron API (secondary bridge)
// ===================================================
contextBridge.exposeInMainWorld("electronAPI", {
  // ---- Theme ----
  toggleTheme: () => ipcRenderer.send("toggle-theme"),

  // ---- System ----
  clearCache: () => ipcRenderer.send("clear-cache"),
  logout: () => ipcRenderer.send("logout"),
  resetAPIKey: () => ipcRenderer.send("reset-api-key"),

  // ---- Data ----
  getUserData: () => ipcRenderer.invoke("get-user-data"),

  // ---- External ----
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
