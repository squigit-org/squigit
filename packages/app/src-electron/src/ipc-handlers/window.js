/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-license-identifier: Apache-2.0
 */

const { BrowserWindow } = require("electron");

module.exports = function (ipcMain) {
  ipcMain.on("close-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  ipcMain.on("minimize-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on("maximize-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize();
    }
  });
};
