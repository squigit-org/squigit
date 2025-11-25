/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { getUserDataPath } = require("../utilities");

module.exports = function (ipcMain) {
  ipcMain.on("open-external-url", (event, url) => shell.openExternal(url));

  ipcMain.handle("check-file-exists", async (event, fileName) => {
    const filePath = path.join(getUserDataPath(), fileName);
    return fs.existsSync(filePath);
  });
};
