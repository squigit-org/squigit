/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

const { BrowserWindow } = require("electron");

module.exports = function (ipcMain) {
  ipcMain.on("close-window", () => BrowserWindow.getFocusedWindow()?.close());
  ipcMain.on("minimize-window", () =>
    BrowserWindow.getFocusedWindow()?.minimize()
  );
  ipcMain.on("maximize-window", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
};
