/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { dialog, shell } = require("electron");

module.exports = function (ipcMain) {
  ipcMain.handle("open-file-dialog", async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "webp"] },
      ],
    });
    return filePaths[0];
  });

  ipcMain.handle("show-unsaved-changes-alert", async () => {
    const result = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Save", "Don't Save"],
      title: "Unsaved Changes",
      message: "You have unsaved changes. Do you want to save them?",
      defaultId: 0,
      cancelId: 1,
    });
    return result.response === 0 ? "save" : "dont-save";
  });

  return {
    showErrorBox: (title, message) => {
      dialog.showMessageBox({
        type: "error",
        title: title,
        message: message,
        buttons: ["OK"],
      });
    },
    showUpdateDialog: (newVersion, oldVersion) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `New version ${newVersion} is available!`,
        detail: `You are on ${oldVersion}. Check the changelog for details.`,
        buttons: ['See Changelog', 'Cancel'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          shell.openExternal('https://github.com/a7mddra/spatialshot/blob/main/CHANGELOG.md');
        }
      });
    }
  };
};
