/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { session } = require("electron");

module.exports = function (ipcMain, getMainView) {
  ipcMain.on("toggle-settings", () => {
    const mainView = getMainView();
    if (mainView) mainView.webContents.send("toggle-settings");
  });

  ipcMain.on("clear-cache", async () => {
    await session.defaultSession.clearCache();
    const mainView = getMainView();
    if (mainView)
      mainView.webContents.send("show-feedback-from-main", {
        message: "cache cleared",
        type: "success",
      });
  });
};
