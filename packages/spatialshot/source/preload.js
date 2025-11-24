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
  setMainViewBounds: (rect) =>
    ipcRenderer.send("set-main-view-bounds", rect),
  hideMainView: () => ipcRenderer.send("hide-main-view"),

  // ---- Auth ----
  startAuth: () => ipcRenderer.send("start-auth"),
  onAuthResult: (callback) =>
    ipcRenderer.on("auth-result", (_, data) => callback(data)),
  checkAuthStatus: () => ipcRenderer.invoke("check-auth-status"),
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

  // ---- Data ----
  getUserData: () => ipcRenderer.invoke("get-user-data"),

  // ---- External ----
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
