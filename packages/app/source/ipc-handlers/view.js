/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { BrowserWindow } = require("electron");

module.exports = function (ipcMain, getMainView, getCurrentImagePath) {
  ipcMain.on("set-main-view-bounds", (event, rect) => {
    const mainView = getMainView();
    if (mainView) {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const [width, height] = win.getSize();
        mainView.setBounds({ x: 0, y: 60, width, height: height - 60 });
      }
      if (getCurrentImagePath()) {
        mainView.webContents.send("image-path", getCurrentImagePath());
      }
    }
  });

  ipcMain.on("hide-main-view", () => {
    const mainView = getMainView();
    if (mainView) {
      mainView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  });
};
