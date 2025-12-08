/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const {
  readPreferences,
  writePreferences,
  defs,
} = require("../utilities");

module.exports = function (ipcMain, mainWindow) {
  ipcMain.handle("get-model", () => readPreferences().model);
  ipcMain.handle("reset-model", () => {
    return defs.model;
  });
  ipcMain.handle("save-model", (event, model) => {
    const p = readPreferences();
    p.model = model;
    writePreferences(p);
    if (mainWindow)
      mainWindow.webContents.send("show-feedback", {
        message: "Model saved",
        type: "done",
      });
  });
};
